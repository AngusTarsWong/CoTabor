import { Skill } from "../../skills/types";
import { L1MuscleMemory, L2SkillMemory, L3RetrievalMatch, L3TacticalMemory } from "../../shared/types/memory";
import { retrieveL1RulesByUrl } from "./l1-rule-retriever";
import { retrieveL2RulesBySkillNames } from "./l2-rule-retriever";
import { l3Bm25Index } from "./l3-bm25-index";
import { inferLanguage } from "./tokenize";
import { buildExecutorL1Hints, buildPlannerMemoryContext, buildReplannerMemoryContext } from "./memory-prompt-builder";
import { summarizeL2Rules } from "./memory-usage-builder";
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
  l2Rules: L2SkillMemory[],
  l3Rules: L3TacticalMemory[],
): Promise<void> {
  const tasks: Promise<void>[] = [
    ...l1Rules.map(r => memoryStore.updateMemoryStability('L1', r.id, growStability(r.stability))),
    ...l2Rules.map(r => memoryStore.updateMemoryStability('L2', r.id, growStability(r.stability))),
    ...l3Rules.map(r => memoryStore.updateMemoryStability('L3', r.id, growStability(r.stability))),
  ];
  // Individual failures must not surface — each update is best-effort.
  await Promise.allSettled(tasks);
}

export async function retrieveTaskMemories(input: {
  request: string;
  currentUrl?: string;
  skills: Skill[];
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

  // Fetch more L3 candidates than needed so we can split into positive + anti-pattern.
  const l3FetchLimit = (searchOptions.limit ?? 3) + 2;

  // In debug mode, fetch scored matches; in production, fetch plain rules to avoid overhead.
  let allL3Rules: L3TacticalMemory[];
  let l3Matches: L3RetrievalMatch[] | undefined;

  if (isDebug) {
    const matches = await l3Bm25Index.search(input.request, {
      ...searchOptions,
      limit: l3FetchLimit,
      returnScores: true as const,
    });
    l3Matches = matches;
    allL3Rules = matches.map(m => m.memory);
  } else {
    allL3Rules = await l3Bm25Index.search(input.request, { ...searchOptions, limit: l3FetchLimit });
  }

  // Split positive (success patterns) from anti-patterns (failure lessons).
  const l3Rules = allL3Rules.filter(r => r.memoryType !== 'anti_pattern').slice(0, searchOptions.limit ?? 3);
  const antiPatternL3Rules = allL3Rules.filter(r => r.memoryType === 'anti_pattern').slice(0, 2);

  const l2Rules = await retrieveL2RulesBySkillNames(input.skills.map((skill) => skill.name));
  const skillDescriptions = new Map<string, string>();
  input.skills.forEach((skill) => {
    const rule = l2Rules.get(skill.name);
    if (!rule?.parameterRules?.trim()) return;
    skillDescriptions.set(skill.name, `${skill.description}\n[L2 Memory Rule] ${rule.parameterRules}`);
  });

  const ragParts: string[] = [];
  if (l1Rules.length > 0) {
    ragParts.push(`[Domain Rules]\n${l1Rules.map((rule) => rule.physicalInstruction).join("\n")}`);
  }
  if (l3Rules.length > 0) {
    ragParts.push(`[Past Tactical Wisdom]\n${l3Rules.map((rule) => rule.tacticalRules).join("\n")}`);
  }
  if (antiPatternL3Rules.length > 0) {
    ragParts.push(`[⚠️ 历史失败教训 - 请务必避开]\n${antiPatternL3Rules.map((rule) => rule.tacticalRules).join("\n")}`);
  }

  // Fire-and-forget: grow Ebbinghaus stability for all retrieved records.
  // Not awaited — retrieval latency must not be affected.
  void updateRetrievedStability(l1Rules, [...l2Rules.values()], [...l3Rules, ...antiPatternL3Rules]);

  return {
    l1Rules,
    l3Rules,
    ragContext: ragParts.join("\n\n"),
    skillDescriptions,
    plannerMemoryContext: buildPlannerMemoryContext({ l1Rules, l3Rules, antiPatternL3Rules }),
    replannerMemoryContext: buildReplannerMemoryContext({ l1Rules, l3Rules }),
    executorL1Hints: buildExecutorL1Hints(l1Rules),
    l2Rules: summarizeL2Rules(l2Rules),
    antiPatternL3Rules,
    l3Matches,
  };
}
