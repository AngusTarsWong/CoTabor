import { L1MuscleMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";

function scoreL1Rule(rule: L1MuscleMemory, path: string): number {
  let score = 0;
  if (rule.pathPattern === path) score += 5;
  else if (path && rule.pathPattern && path.includes(rule.pathPattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\]/g, ""))) score += 2;

  const executionScore = Math.min(rule.executionCount * 0.1, 2);
  const successRate = rule.executionCount > 0 ? rule.successCount / rule.executionCount : 0;
  return score + executionScore + successRate * 3;
}

export async function retrieveL1RulesByUrl(currentUrl?: string): Promise<L1MuscleMemory[]> {
  if (!currentUrl) return [];

  try {
    const parsed = new URL(currentUrl);
    const rules = await memoryStore.getL1RulesByDomain(parsed.hostname);
    return rules.sort((a, b) => scoreL1Rule(b, parsed.pathname) - scoreL1Rule(a, parsed.pathname));
  } catch {
    return [];
  }
}

