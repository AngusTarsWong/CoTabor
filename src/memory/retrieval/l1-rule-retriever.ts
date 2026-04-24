import { L1MuscleMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";
import { computeRetention } from "./heat";

function scoreL1Rule(rule: L1MuscleMemory, path: string): number {
  let score = 0;
  if (rule.pathPattern === path) score += 5;
  else if (path && rule.pathPattern && path.includes(rule.pathPattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\]/g, ""))) score += 2;

  const executionScore = Math.min(rule.executionCount * 0.1, 2);
  const successRate = rule.executionCount > 0 ? rule.successCount / rule.executionCount : 0;
  // Ebbinghaus retention bonus: replaces no time-awareness with continuous decay.
  // Range: 0–1.0 (new: ~1.0, 7 days unused S=2: ~0.03, 7 days with S=10: ~0.50)
  const retentionBonus = computeRetention(rule) * 1.0;

  return score + executionScore + successRate * 3 + retentionBonus;
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
