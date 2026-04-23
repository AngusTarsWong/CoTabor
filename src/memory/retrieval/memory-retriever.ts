import { Skill } from "../../skills/types";
import { L1MuscleMemory, L3RetrievalMatch, L3TacticalMemory } from "../../shared/types/memory";
import { retrieveL1RulesByUrl } from "./l1-rule-retriever";
import { retrieveL2RulesBySkillNames } from "./l2-rule-retriever";
import { l3Bm25Index } from "./l3-bm25-index";
import { inferLanguage } from "./tokenize";
import { buildExecutorL1Hints, buildPlannerMemoryContext, buildReplannerMemoryContext } from "./memory-prompt-builder";
import { summarizeL2Rules } from "./memory-usage-builder";
import { ENV } from "../../shared/constants/env";

export interface MemoryRetrievalResult {
  l1Rules: L1MuscleMemory[];
  l3Rules: L3TacticalMemory[];
  ragContext: string;
  skillDescriptions: Map<string, string>;
  plannerMemoryContext: string;
  replannerMemoryContext: string;
  executorL1Hints: string[];
  l2Rules: string[];
  /** Populated only in debug mode (VITE_DEBUG_MODE=true). Contains per-result score breakdowns. */
  l3Matches?: L3RetrievalMatch[];
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

  // In debug mode, fetch scored matches; in production, fetch plain rules to avoid overhead.
  let l3Rules: L3TacticalMemory[];
  let l3Matches: L3RetrievalMatch[] | undefined;

  if (isDebug) {
    const matches = await l3Bm25Index.search(input.request, { ...searchOptions, returnScores: true as const });
    l3Matches = matches;
    l3Rules = matches.map(m => m.memory);
  } else {
    l3Rules = await l3Bm25Index.search(input.request, searchOptions);
  }

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

  return {
    l1Rules,
    l3Rules,
    ragContext: ragParts.join("\n\n"),
    skillDescriptions,
    plannerMemoryContext: buildPlannerMemoryContext({ l1Rules, l3Rules }),
    replannerMemoryContext: buildReplannerMemoryContext({ l1Rules, l3Rules }),
    executorL1Hints: buildExecutorL1Hints(l1Rules),
    l2Rules: summarizeL2Rules(l2Rules),
    l3Matches,
  };
}
