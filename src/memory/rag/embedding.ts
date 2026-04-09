import { OpenAIEmbeddings } from "@langchain/openai";

/**
 * Get embedding vector using Cloud Provider API (OpenAI text-embedding-3-small)
 * This avoids heavy local models and keeps the extension extremely lightweight.
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (!text) return [];
  
  // text-embedding-3-small outputs 1536-dimensional vectors
  // It is fast, cheap, and very effective for semantic matching
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    modelName: "text-embedding-3-small",
  });
  
  try {
    return await embeddings.embedQuery(text);
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}
