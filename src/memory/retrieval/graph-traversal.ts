import { MemoryItem, L3WorkflowMeta } from "../../shared/types/memory";
import { memoryProvider } from "../store/memory-provider";

const EDGE_WEIGHT_THRESHOLD = 0.3;
const MAX_EXPANDED_POSITIVE = 2;
const MAX_EXPANDED_ANTI_PATTERN = 1;

export interface GraphExpansionResult {
  expandedPositive: MemoryItem[];
  expandedAntiPattern: MemoryItem[];
}

export async function expandViaGraph(
  seedItems: MemoryItem[],
  antiPatternItems: MemoryItem[],
): Promise<GraphExpansionResult> {
  const knownIds = new Set<string>([
    ...seedItems.map((m) => m.id),
    ...antiPatternItems.map((m) => m.id),
  ]);

  const expandedPositive: MemoryItem[] = [];
  const expandedAntiPattern: MemoryItem[] = [];

  await Promise.all(
    seedItems.map(async (seed) => {
      // edges are stored in memory_edges, accessible via memoryStore directly
      // We import memoryStore for edge lookups only (edges are not MemoryItems)
      const { memoryStore } = await import("../store/indexeddb");
      const edges = await memoryStore.getEdgesForMemory(seed.id);

      for (const edge of edges) {
        if (edge.weight < EDGE_WEIGHT_THRESHOLD) continue;

        const neighbourId = edge.sourceId === seed.id ? edge.targetId : edge.sourceId;
        if (knownIds.has(neighbourId)) continue;
        knownIds.add(neighbourId);

        const neighbour = await memoryProvider.get(neighbourId);
        if (!neighbour) continue;

        const m = neighbour.meta as L3WorkflowMeta;
        const isAntiPattern = edge.relation === "contradicts" || m.memoryType === "anti_pattern";
        if (isAntiPattern) {
          if (expandedAntiPattern.length < MAX_EXPANDED_ANTI_PATTERN) expandedAntiPattern.push(neighbour);
        } else {
          if (expandedPositive.length < MAX_EXPANDED_POSITIVE) expandedPositive.push(neighbour);
        }

        if (expandedPositive.length >= MAX_EXPANDED_POSITIVE && expandedAntiPattern.length >= MAX_EXPANDED_ANTI_PATTERN) return;
      }
    }),
  );

  return { expandedPositive, expandedAntiPattern };
}
