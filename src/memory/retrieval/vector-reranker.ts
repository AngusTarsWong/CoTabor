import { L3RetrievalMatch } from "../../shared/types/memory";
import { cosineSimilarity, hybridScore } from "./vector-scorer";

/**
 * Re-rank a set of BM25-scored L3 candidates using a query embedding.
 *
 * For each candidate that has a pre-computed embedding, the cosine similarity
 * to the query vector is added to its existing BM25+bonus score via hybridScore().
 * Candidates without embeddings keep their original BM25-only score so they can
 * still surface when vector coverage is partial.
 *
 * @param candidates  Output of l3Bm25Index.search(..., {returnScores: true}).
 *                    Should contain more items than `limit` for the re-ranking
 *                    to be effective (recommended: at least 12).
 * @param queryEmbedding  Embedding of the user's query from l3Embedder.embed().
 * @param limit  Final number of results to return.
 */
export function rerankWithVector(
  candidates: L3RetrievalMatch[],
  queryEmbedding: number[],
  limit: number,
): L3RetrievalMatch[] {
  return candidates
    .map((match): L3RetrievalMatch => {
      const ruleEmbedding = match.memory.embedding;
      if (!ruleEmbedding || ruleEmbedding.length === 0) {
        // No embedding yet — keep original BM25 score so the candidate still competes.
        return match;
      }
      const cosine = cosineSimilarity(queryEmbedding, ruleEmbedding);
      return {
        memory: match.memory,
        score: hybridScore(match.score, cosine),
        scoreBreakdown: { ...match.scoreBreakdown, cosine },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
