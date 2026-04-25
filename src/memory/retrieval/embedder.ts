import OpenAI from "openai";
import { ENV } from "../../shared/constants/env";
import { L3TacticalMemory } from "../../shared/types/memory";

/** Reduced dimensions keep stored vectors small while retaining quality. */
const EMBEDDING_DIMS = 512;
const EMBEDDING_MODEL = "text-embedding-3-small";
/** Truncate input so we stay well within token limits. */
const MAX_INPUT_CHARS = 2000;

/**
 * Thin singleton around the OpenAI Embeddings API.
 *
 * Design principles:
 *  - Lazy init: the OpenAI client is created on first use, not at import time.
 *  - Graceful degradation: every public method returns null on failure instead of
 *    throwing, so callers can fall back to BM25-only retrieval transparently.
 *  - No caching of embeddings here — the caller stores results in IndexedDB.
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

  /**
   * Embed a single text string.
   * Returns null when the API key is absent or the call fails.
   */
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

  /**
   * Build the canonical embedding input text for an L3 rule.
   * Concatenates the most semantically rich fields, separated by " | ".
   */
  buildText(rule: Pick<L3TacticalMemory, "memoryTitle" | "intentQuery" | "keywords">): string {
    return [
      rule.memoryTitle,
      rule.intentQuery,
      (rule.keywords ?? []).join(" "),
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

export const l3Embedder = new L3Embedder();
