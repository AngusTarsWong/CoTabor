import { MemoryItem, L1HintMeta } from "../../shared/types/memory";
import { memoryProvider } from "../store/memory-provider";
import { computeRetention } from "./heat";

function scoreL1Item(item: MemoryItem, path: string): number {
  const m = item.meta as L1HintMeta;
  let score = 0;
  if (m.pathPattern === path) score += 5;
  else if (path && m.pathPattern && path.includes(m.pathPattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\]/g, ""))) score += 2;

  const executionScore = Math.min(m.executionCount * 0.1, 2);
  const successRate = m.executionCount > 0 ? m.successCount / m.executionCount : 0;
  const retentionBonus = computeRetention(item) * 1.0;

  return score + executionScore + successRate * 3 + retentionBonus;
}

export async function retrieveL1ItemsByUrl(currentUrl?: string): Promise<MemoryItem[]> {
  if (!currentUrl) return [];
  try {
    const parsed = new URL(currentUrl);
    const tag = `domain:${parsed.hostname}`;
    const items = await memoryProvider.search({ type: 'L1_HINT', anyTags: [tag] });
    return items.sort((a, b) => scoreL1Item(b, parsed.pathname) - scoreL1Item(a, parsed.pathname));
  } catch {
    return [];
  }
}
