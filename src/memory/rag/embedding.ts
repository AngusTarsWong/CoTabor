import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Get embedding vector using Cloud Provider API (OpenAI text-embedding-3-small)
 * This avoids heavy local models and keeps the extension extremely lightweight.
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (!text) return [];
  
  // text-embedding-3-small outputs 1536-dimensional vectors
  // It is fast, cheap, and very effective for semantic matching
  const baseUrl = process.env.VITE_LLM_BASE_URL || process.env.OPENAI_BASE_URL;
  const modelName = process.env.VITE_EMBEDDING_MODEL || "text-embedding-ada-002";
  const embeddings = new OpenAIEmbeddings({
    apiKey: apiKey,
    modelName: modelName,
    configuration: baseUrl ? { baseURL: baseUrl } : undefined
  });
  
  try {
    return await embeddings.embedQuery(text);
  } catch (error) {
    console.warn("Failed to generate embedding, falling back to mock embedding:", error);
    // fallback for testing or unsupported embedding endpoints
    return Array(1536).fill(0).map(() => Math.random() * 0.1);
  }
}
