import { MemoryItem } from "../../shared/types/memory";
import { Skill } from "../../skills/types";
import { retrieveTaskMemories } from "./memory-retriever";
import { buildMemoryNodeUsage, NodeMemoryUsage } from "./memory-usage-builder";

export interface RetrievedMemoriesPayload {
  plannerContext: string;
  replannerContext: string;
  executorL1Hints: string[];
  l1Items: MemoryItem[];
  l3Items: MemoryItem[];
  antiPatternL3Items: MemoryItem[];
  l2Rules: string[];
  l3Matches?: import("../../shared/types/memory").L3RetrievalMatch[];
}

export interface RetrievedMemoryAssemblyResult {
  availableSkills: Skill[];
  retrievedMemories: RetrievedMemoriesPayload;
  nodeMemoryUsage: NodeMemoryUsage;
}

export async function retrieveAndAssembleMemories(input: {
  request: string;
  currentUrl?: string;
  skills: Skill[];
  taskRunId?: string;
  taskType?: string;
}): Promise<RetrievedMemoryAssemblyResult> {
  const retrieval = await retrieveTaskMemories({
    request: input.request,
    currentUrl: input.currentUrl,
    skills: input.skills,
    taskRunId: input.taskRunId,
    taskType: input.taskType,
  });

  let availableSkills = input.skills;
  if (retrieval.skillDescriptions.size > 0) {
    availableSkills = input.skills.map((skill) => {
      const enrichedDescription = retrieval.skillDescriptions.get(skill.name);
      return enrichedDescription ? { ...skill, description: enrichedDescription } : skill;
    });
  }

  const retrievedMemories: RetrievedMemoriesPayload = {
    plannerContext: retrieval.plannerMemoryContext,
    replannerContext: retrieval.replannerMemoryContext,
    executorL1Hints: retrieval.executorL1Hints,
    l1Items: retrieval.l1Items,
    l3Items: retrieval.l3Items,
    antiPatternL3Items: retrieval.antiPatternL3Items,
    l2Rules: retrieval.l2Rules,
    l3Matches: retrieval.l3Matches,
  };

  return {
    availableSkills,
    retrievedMemories,
    nodeMemoryUsage: buildMemoryNodeUsage({
      plannerContext: retrieval.plannerMemoryContext,
      l2Rules: retrieval.l2Rules,
    }),
  };
}
