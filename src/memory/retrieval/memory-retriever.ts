import { Skill } from "../../skills/types";
import { L1MuscleMemory, L2SkillMemory, L3RetrievalMatch, L3TacticalMemory, MemoryAttributionRecord, MemoryLevel } from "../../shared/types/memory";
import { retrieveL1RulesByUrl } from "./l1-rule-retriever";
import { L2RulePair, retrieveL2RulesBySkillNames } from "./l2-rule-retriever";
import { l3Bm25Index } from "./l3-bm25-index";
import { l3Embedder } from "./embedder";
import { rerankWithVector } from "./vector-reranker";
import { inferLanguage } from "./tokenize";
import { buildExecutorL1Hints, buildPlannerMemoryContext, buildReplannerMemoryContext } from "./memory-prompt-builder";
import { summarizeL2Rules } from "./memory-usage-builder";
import { expandViaGraph } from "./graph-traversal";
import { ENV } from "../../shared/constants/env";
import { growStability } from "./heat";
import { memoryStore } from "../store/indexeddb";

export interface MemoryRetrievalResult {
  l1Rules: L1MuscleMemory[];
  l3Rules: L3TacticalMemory[];
  ragContext: string;
  skillDescriptions: Map<string, string>;
  plannerMemoryContext: string;
  replannerMemoryContext: string;
  executorL1Hints: string[];
  l2Rules: string[];
  /** Anti-pattern L3 memories retrieved alongside positive ones (failure lessons). */
  antiPatternL3Rules: L3TacticalMemory[];
  /** Populated only in debug mode (VITE_DEBUG_MODE=true). Contains per-result score breakdowns. */
  l3Matches?: L3RetrievalMatch[];
}

/**
 * Grow the Ebbinghaus stability for every memory record that was just served to the agent.
 * Called fire-and-forget so it never delays the retrieval response.
 */
async function updateRetrievedStability(
  l1Rules: L1MuscleMemory[],
  l2RuleMap: Map<string, L2RulePair>,
  l3Rules: L3TacticalMemory[],
): Promise<void> {
  const l2Flat: L2SkillMemory[] = [];
  l2RuleMap.forEach(pair => {
    if (pair.base) l2Flat.push(pair.base);
    if (pair.contextual) l2Flat.push(pair.contextual);
  });

  const tasks: Promise<void>[] = [
    ...l1Rules.map(r => memoryStore.updateMemoryStability('L1', r.id, growStability(r.stability))),
    ...l2Flat.map(r => memoryStore.updateMemoryStability('L2', r.id, growStability(r.stability))),
    ...l3Rules.map(r => memoryStore.updateMemoryStability('L3', r.id, growStability(r.stability))),
  ];
  // Individual failures must not surface — each update is best-effort.
  await Promise.allSettled(tasks);
}

/**
 * Write attribution records for all memories served in this retrieval.
 * Called fire-and-forget so it never delays the retrieval response.
 */
async function writeAttributionRecords(
  taskRunId: string,
  l1Rules: L1MuscleMemory[],
  l2RuleMap: Map<string, L2RulePair>,
  l3Rules: L3TacticalMemory[],
): Promise<void> {
  const now = Date.now();

  function makeRecord(memoryId: string, level: MemoryLevel): MemoryAttributionRecord {
    return {
      id: `attr_${taskRunId}_${memoryId}`,
      taskRunId,
      memoryId,
      memoryLevel: level,
      retrievedAt: now,
    };
  }

  const records: MemoryAttributionRecord[] = [
    ...l1Rules.map(r => makeRecord(r.id, 'L1')),
    ...l3Rules.map(r => makeRecord(r.id, 'L3')),
  ];
  l2RuleMap.forEach(pair => {
    if (pair.base) records.push(makeRecord(pair.base.id, 'L2'));
    if (pair.contextual) records.push(makeRecord(pair.contextual.id, 'L2'));
  });

  await Promise.allSettled(records.map(r => memoryStore.putAttribution(r)));
}

export async function retrieveTaskMemories(input: {
  request: string;
  currentUrl?: string;
  skills: Skill[];
  /** Pre-generated task run ID from agent.ts — used for attribution tracking. */
  taskRunId?: string;
  /** Task type inferred from planner state or L3 results — used for L2 contextual lookup. */
  taskType?: string;
}): Promise<MemoryRetrievalResult> {
  const l1Rules = await retrieveL1RulesByUrl(input.currentUrl);

  let domainScope = "";
  try {
    domainScope = input.currentUrl ? new URL(input.currentUrl).hostname : "";
  } catch {
    domainScope = "";
  }

  const searchOptions = {
    domainScope,
    language: inferLanguage([input.request]),
    limit: 3,
  };

  const isDebug = ENV.DEBUG_MODE;

  // --- Hybrid BM25 + Vector retrieval ---
  // Step 1: BM25 over-fetch with scores. Fixed at 12 candidates so the vector
  //         reranker has a meaningful pool without blowing retrieval latency.
  const BM25_HYBRID_FETCH = 12;
  const bm25Candidates = await l3Bm25Index.search(input.request, {
    ...searchOptions,
    limit: BM25_HYBRID_FETCH,
    returnScores: true as const,
  });

  // Step 2: Attempt vector re-ranking. Falls back to BM25-only silently when
  //         the embedder has no API key or the network call fails.
  const queryEmbedding = await l3Embedder.embed(input.request);

  // Final desired count: enough to split into positives + anti-patterns.
  const finalLimit = (searchOptions.limit ?? 3) + 2;

  let rankedMatches: L3RetrievalMatch[];
  if (queryEmbedding) {
    rankedMatches = rerankWithVector(bm25Candidates, queryEmbedding, finalLimit);
  } else {
    rankedMatches = bm25Candidates.slice(0, finalLimit);
  }

  const allL3Rules: L3TacticalMemory[] = rankedMatches.map(m => m.memory);
  const l3Matches: L3RetrievalMatch[] | undefined = isDebug ? rankedMatches : undefined;

  // Split positive (success patterns) from anti-patterns (failure lessons).
  const l3RulesBm25 = allL3Rules.filter(r => r.memoryType !== 'anti_pattern').slice(0, searchOptions.limit ?? 3);
  const antiPatternBm25 = allL3Rules.filter(r => r.memoryType === 'anti_pattern').slice(0, 2);

  // Graph expansion: follow typed edges to surface related memories BM25 missed.
  const { expandedPositive, expandedAntiPattern } = await expandViaGraph(l3RulesBm25, antiPatternBm25);

  const l3Rules = [...l3RulesBm25, ...expandedPositive];
  const antiPatternL3Rules = [...antiPatternBm25, ...expandedAntiPattern];

  // Derive effective task type: explicit param takes priority, then infer from top L3 result.
  const effectiveTaskType = input.taskType || l3Rules[0]?.taskType || "";

  const l2RuleMap = await retrieveL2RulesBySkillNames(
    input.skills.map(skill => skill.name),
    effectiveTaskType || undefined,
  );

  // Enrich skill descriptions with both base and contextual L2 rules.
  const skillDescriptions = new Map<string, string>();
  input.skills.forEach(skill => {
    const pair = l2RuleMap.get(skill.name);
    if (!pair) return;
    const ruleParts = [
      pair.base?.parameterRules?.trim(),
      pair.contextual?.parameterRules?.trim(),
    ].filter(Boolean);
    if (ruleParts.length > 0) {
      skillDescriptions.set(skill.name, `${skill.description}\n[L2 Memory Rules] ${ruleParts.join(' | ')}`);
    }
  });

  const ragParts: string[] = [];
  if (l1Rules.length > 0) {
    ragParts.push(`[Domain Rules]\n${l1Rules.map(rule => rule.physicalInstruction).join("\n")}`);
  }
  if (l3Rules.length > 0) {
    ragParts.push(`[Past Tactical Wisdom]\n${l3Rules.map(rule => rule.tacticalRules).join("\n")}`);
  }
  if (antiPatternL3Rules.length > 0) {
    ragParts.push(`[⚠️ 历史失败教训 - 请务必避开]\n${antiPatternL3Rules.map(rule => rule.tacticalRules).join("\n")}`);
  }

  // Fire-and-forget: grow Ebbinghaus stability for all retrieved records.
  void updateRetrievedStability(l1Rules, l2RuleMap, [...l3Rules, ...antiPatternL3Rules]);

  // Fire-and-forget: write attribution records so the quality loop can be closed later.
  if (input.taskRunId) {
    void writeAttributionRecords(input.taskRunId, l1Rules, l2RuleMap, [...l3Rules, ...antiPatternL3Rules]);
  }

  return {
    l1Rules,
    l3Rules,
    ragContext: ragParts.join("\n\n"),
    skillDescriptions,
    plannerMemoryContext: buildPlannerMemoryContext({ l1Rules, l3Rules, antiPatternL3Rules }),
    replannerMemoryContext: buildReplannerMemoryContext({ l1Rules, l3Rules }),
    executorL1Hints: buildExecutorL1Hints(l1Rules),
    l2Rules: summarizeL2Rules(l2RuleMap),
    antiPatternL3Rules,
    l3Matches,
  };
}
