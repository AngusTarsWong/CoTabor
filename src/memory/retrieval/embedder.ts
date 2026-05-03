import { MemoryItem } from "../../shared/types/memory";
import { ENV } from "../../shared/constants/env";
import OpenAI from "openai";

/** Reduced dimensions keep stored vectors small while retaining quality. */
const EMBEDDING_DIMS = 512;
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_INPUT_CHARS = 2000;

/**
 * Thin singleton around the OpenAI Embeddings API — used for query embedding only.
 * Item embeddings are NOT stored (vector storage was explicitly excluded from scope).
 * Gracefully returns null on failure so callers fall back to BM25-only retrieval.
 */
class L3Embedder {
  private client: OpenAI | null = null;

  private getClient(): OpenAI | null {
    if (this.client) return this.client;
    const apiKey = ENV.PLANNER_CONFIG.apiKey;
    if (!apiKey) return null;
    const baseURL = ENV.PLANNER_CONFIG.baseUrl || undefined;
    this.client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
    return this.client;
  }

  async embed(text: string): Promise<number[] | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, MAX_INPUT_CHARS),
        dimensions: EMBEDDING_DIMS,
      });
      return response.data[0].embedding;
    } catch {
      return null;
    }
  }

  /** Build the canonical embedding input text from a L3 MemoryItem. */
  buildText(item: Pick<MemoryItem, "title" | "content">): string {
    return [item.title, item.content].filter(Boolean).join(" | ");
  }
}

export const l3Embedder = new L3Embedder();
