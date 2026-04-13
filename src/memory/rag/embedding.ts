/**
 * Volcengine Ark Multimodal Embedding Provider
 * Implements the text & vision embedding using `doubao-embedding-vision`
 */

export interface MultimodalInput {
  type: "text" | "image_url" | "video_url";
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
}

export class VolcengineEmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config?: { apiKey?: string; model?: string; baseUrl?: string }) {
    // Defaults to VITE_ARK_EMBEDDING_API_KEY from environment
    this.apiKey = config?.apiKey || process.env.VITE_ARK_EMBEDDING_API_KEY || "";
    this.model = config?.model || process.env.VITE_ARK_EMBEDDING_MODEL || "doubao-embedding-vision-251215";
    this.baseUrl = config?.baseUrl || "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal";
  }

  /**
   * Get the multimodal embedding vector (2048-dimensional)
   */
  async getEmbedding(input: string | MultimodalInput[]): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("Missing VITE_ARK_EMBEDDING_API_KEY for Volcengine Embedding");
    }

    const formattedInput: MultimodalInput[] =
      typeof input === "string" ? [{ type: "text", text: input }] : input;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: formattedInput,
        encoding_format: "float",
        // dimensions: 1024 // Optional: explicit request for 1024 dimensions
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Volcengine Embedding Error: ${data.error?.message || JSON.stringify(data)}`);
    }

    // Return the dense embedding (default 2048 dimensions)
    return data.data.embedding;
  }
}

/**
 * Backward compatibility wrapper for existing code.
 * Replaces the old OpenAI text-embedding-ada-002 implementation.
 * Outputs 2048-dimensional vectors.
 */
export async function getEmbedding(text: string, apiKey?: string): Promise<number[]> {
  if (!text) return [];

  const provider = new VolcengineEmbeddingProvider({ apiKey });
  return await provider.getEmbedding(text);
}
