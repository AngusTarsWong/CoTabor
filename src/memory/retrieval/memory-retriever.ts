import { MemoryItem, L3WorkflowMeta } from "../../shared/types/memory";
import { MemoryAttributionRecord, MemoryLevel } from "../../shared/types/memory";
import { Skill } from "../../skills/types";
import { retrieveL1ItemsByUrl } from "./l1-rule-retriever";
import { L2RulePair, retrieveL2RulesBySkillNames } from "./l2-rule-retriever";
import { l3Bm25Index } from "./l3-bm25-index";
import { inferLanguage } from "./tokenize";
import { buildExecutorL1Hints, buildPlannerMemoryContext, buildReplannerMemoryContext } from "./memory-prompt-builder";
import { summarizeL2Rules } from "./memory-usage-builder";
import { expandViaGraph } from "./graph-traversal";
import { ENV } from "../../shared/constants/env";
import { growStability } from "./heat";
import { memoryStore } from "../store/indexeddb";
import { memoryProvider } from "../store/memory-provider";

export interface MemoryRetrievalResult {
  l1Items: MemoryItem[];
  l3Items: MemoryItem[];
  ragContext: string;
  skillDescriptions: Map<string, string>;
  plannerMemoryContext: string;
  replannerMemoryContext: string;
  executorL1Hints: string[];
  l2Rules: string[];
  antiPatternL3Items: MemoryItem[];
  l3Matches?: import("../../shared/types/memory").L3RetrievalMatch[];
}

async function updateRetrievedStability(
  l1Items: MemoryItem[],
  l2RuleMap: Map<string, L2RulePair>,
  l3Items: MemoryItem[],
): Promise<void> {
  const l2Flat: MemoryItem[] = [];
  l2RuleMap.forEach((pair) => {
    if (pair.base) l2Flat.push(pair.base);
    if (pair.contextual) l2Flat.push(pair.contextual);
  });

  const tasks: Promise<void>[] = [
    ...l1Items.map((item) => memoryProvider.touchStability(item.id, growStability(item.stability))),
    ...l2Flat.map((item) => memoryProvider.touchStability(item.id, growStability(item.stability))),
    ...l3Items.map((item) => memoryProvider.touchStability(item.id, growStability(item.stability))),
  ];
  await Promise.allSettled(tasks);
}

async function writeAttributionRecords(
  taskRunId: string,
  l1Items: MemoryItem[],
  l2RuleMap: Map<string, L2RulePair>,
  l3Items: MemoryItem[],
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
    ...l1Items.map((item) => makeRecord(item.id, "L1")),
    ...l3Items.map((item) => makeRecord(item.id, "L3")),
  ];
  l2RuleMap.forEach((pair) => {
    if (pair.base) records.push(makeRecord(pair.base.id, "L2"));
    if (pair.contextual) records.push(makeRecord(pair.contextual.id, "L2"));
  });

  await Promise.allSettled(records.map((r) => memoryStore.putAttribution(r)));
}

export async function retrieveTaskMemories(input: {
  request: string;
  currentUrl?: string;
  skills: Skill[];
  taskRunId?: string;
  taskType?: string;
}): Promise<MemoryRetrievalResult> {
  const l1Items = await retrieveL1ItemsByUrl(input.currentUrl);

  let domainScope = "";
  try {
    domainScope = input.currentUrl ? new URL(input.currentUrl).hostname : "";
  } catch { /**/ }

  const searchOptions = {
    domainScope,
    language: inferLanguage([input.request]),
    limit: 3,
  };

  const isDebug = ENV.DEBUG_MODE;

  // BM25 retrieval with optional score breakdown for debug
  const BM25_FETCH = 12;
  const bm25Candidates = await l3Bm25Index.search(input.request, {
    ...searchOptions,
    limit: BM25_FETCH,
    returnScores: true as const,
  });

  const finalLimit = (searchOptions.limit ?? 3) + 2;
  const rankedMatches = bm25Candidates.slice(0, finalLimit);
  const allL3Items: MemoryItem[] = rankedMatches.map((m) => m.memory);
  const l3Matches = isDebug ? rankedMatches : undefined;

  // Split positive / anti-pattern
  const l3ItemsBm25 = allL3Items
    .filter((item) => (item.meta as L3WorkflowMeta).memoryType !== "anti_pattern")
    .slice(0, searchOptions.limit ?? 3);
  const antiPatternBm25 = allL3Items
    .filter((item) => (item.meta as L3WorkflowMeta).memoryType === "anti_pattern")
    .slice(0, 2);

  // Graph expansion
  const { expandedPositive, expandedAntiPattern } = await expandViaGraph(l3ItemsBm25, antiPatternBm25);
  const l3Items = [...l3ItemsBm25, ...expandedPositive];
  const antiPatternL3Items = [...antiPatternBm25, ...expandedAntiPattern];

  const effectiveTaskType = input.taskType || (l3Items[0]?.meta as L3WorkflowMeta | undefined)?.taskType || "";

  const l2RuleMap = await retrieveL2RulesBySkillNames(
    input.skills.map((s) => s.name),
    effectiveTaskType || undefined,
  );

  // Enrich skill descriptions with L2 rules
  const skillDescriptions = new Map<string, string>();
  input.skills.forEach((skill) => {
    const pair = l2RuleMap.get(skill.name);
    if (!pair) return;
    const ruleParts = [
      (pair.base?.meta as import("../../shared/types/memory").L2RuleMeta | undefined)?.parameterRules?.trim(),
      (pair.contextual?.meta as import("../../shared/types/memory").L2RuleMeta | undefined)?.parameterRules?.trim(),
    ].filter(Boolean);
    if (ruleParts.length > 0) {
      skillDescriptions.set(skill.name, `${skill.description}\n[L2 Memory Rules] ${ruleParts.join(" | ")}`);
    }
  });

  const ragParts: string[] = [];
  if (l1Items.length > 0) {
    ragParts.push(`[Domain Rules]\n${l1Items.map((item) => (item.meta as import("../../shared/types/memory").L1HintMeta).physicalInstruction).join("\n")}`);
  }
  if (l3Items.length > 0) {
    ragParts.push(`[Past Tactical Wisdom]\n${l3Items.map((item) => (item.meta as L3WorkflowMeta).tacticalRules).join("\n")}`);
  }
  if (antiPatternL3Items.length > 0) {
    ragParts.push(`[⚠️ 历史失败教训 - 请务必避开]\n${antiPatternL3Items.map((item) => (item.meta as L3WorkflowMeta).tacticalRules).join("\n")}`);
  }

  void updateRetrievedStability(l1Items, l2RuleMap, [...l3Items, ...antiPatternL3Items]);

  if (input.taskRunId) {
    void writeAttributionRecords(input.taskRunId, l1Items, l2RuleMap, [...l3Items, ...antiPatternL3Items]);
  }

  return {
    l1Items,
    l3Items,
    ragContext: ragParts.join("\n\n"),
    skillDescriptions,
    plannerMemoryContext: buildPlannerMemoryContext({ l1Items, l3Items, antiPatternL3Items }),
    replannerMemoryContext: buildReplannerMemoryContext({ l1Items, l3Items }),
    executorL1Hints: buildExecutorL1Hints(l1Items),
    l2Rules: summarizeL2Rules(l2RuleMap),
    antiPatternL3Items,
    l3Matches,
  };
}
