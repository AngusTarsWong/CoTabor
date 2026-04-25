/**
 * Pure vector-math utilities for hybrid BM25 + cosine retrieval.
 * No external dependencies — safe to import anywhere.
 */

/**
 * Cosine similarity between two equal-length numeric vectors.
 * Returns 0 when either vector is zero-length or dimensions mismatch.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Combine a BM25-based score (which already includes all bonus terms) with a
 * cosine similarity value into a single hybrid score.
 *
 * Cosine ∈ [−1, 1]; multiply by COSINE_WEIGHT so it is comparable in magnitude
 * with the BM25+bonus range (roughly 0–15 in practice).
 */
const COSINE_WEIGHT = 4;

export function hybridScore(bm25WithBonuses: number, cosine: number): number {
  return bm25WithBonuses + cosine * COSINE_WEIGHT;
}
