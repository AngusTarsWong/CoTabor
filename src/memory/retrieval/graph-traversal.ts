import { L3TacticalMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";

/**
 * Minimum edge weight required to follow a link during graph traversal.
 * Low-confidence edges (below this threshold) are skipped.
 */
const EDGE_WEIGHT_THRESHOLD = 0.3;

/**
 * Maximum number of graph-expanded memories added to the result set.
 * Keeps context injection bounded regardless of graph connectivity.
 */
const MAX_EXPANDED_POSITIVE = 2;
const MAX_EXPANDED_ANTI_PATTERN = 1;

export interface GraphExpansionResult {
  /** Additional positive memories surfaced via graph traversal (not in the original BM25 set). */
  expandedPositive: L3TacticalMemory[];
  /** Additional anti-pattern memories surfaced via 'contradicts' edges. */
  expandedAntiPattern: L3TacticalMemory[];
}

/**
 * Expand a BM25 retrieval result set by following typed knowledge-graph edges.
 *
 * For each memory in the seed set the function loads its edges from IndexedDB and:
 * - Follows non-contradicts edges with weight ≥ EDGE_WEIGHT_THRESHOLD to find neighbours
 *   that BM25 didn't surface, adding them as extra positive context.
 * - Follows 'contradicts' edges to surface conflicting advice as additional anti-patterns.
 *
 * Already-known memories (present in `knownIds`) are never added again.
 */
export async function expandViaGraph(
  seedMemories: L3TacticalMemory[],
  antiPatternMemories: L3TacticalMemory[],
): Promise<GraphExpansionResult> {
  const knownIds = new Set<string>([
    ...seedMemories.map(m => m.id),
    ...antiPatternMemories.map(m => m.id),
  ]);

  const expandedPositive: L3TacticalMemory[] = [];
  const expandedAntiPattern: L3TacticalMemory[] = [];

  // Process all seed memories in parallel for speed.
  await Promise.all(
    seedMemories.map(async seed => {
      const edges = await memoryStore.getEdgesForMemory(seed.id);

      for (const edge of edges) {
        if (edge.weight < EDGE_WEIGHT_THRESHOLD) continue;

        const neighbourId = edge.sourceId === seed.id ? edge.targetId : edge.sourceId;
        if (knownIds.has(neighbourId)) continue;

        knownIds.add(neighbourId); // claim slot immediately to avoid double-loading

        const neighbour = await memoryStore.getL3Rule(neighbourId);
        if (!neighbour) continue;

        if (edge.relation === 'contradicts') {
          if (expandedAntiPattern.length < MAX_EXPANDED_ANTI_PATTERN) {
            expandedAntiPattern.push(neighbour);
          }
        } else {
          // 'refines', 'extends', 'co_occurs', 'prerequisite' — all add positive context.
          if (expandedPositive.length < MAX_EXPANDED_POSITIVE) {
            expandedPositive.push(neighbour);
          }
        }

        // Stop early if both buckets are full.
        if (
          expandedPositive.length >= MAX_EXPANDED_POSITIVE &&
          expandedAntiPattern.length >= MAX_EXPANDED_ANTI_PATTERN
        ) {
          return;
        }
      }
    })
  );

  return { expandedPositive, expandedAntiPattern };
}
