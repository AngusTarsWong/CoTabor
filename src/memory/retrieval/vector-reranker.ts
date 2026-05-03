import { L3RetrievalMatch } from "../../shared/types/memory";

/**
 * Vector re-ranker — currently a passthrough.
 *
 * MemoryItem does not carry an embedding field (vector storage is intentionally
 * excluded from the current architecture). The function returns candidates
 * unchanged so BM25 ordering is preserved. The stub signature is kept so callers
 * don't need to change when embeddings are introduced in the future.
 */
export function rerankWithVector(
  candidates: L3RetrievalMatch[],
  _queryEmbedding: number[],
  limit: number,
): L3RetrievalMatch[] {
  return candidates.slice(0, limit);
}
