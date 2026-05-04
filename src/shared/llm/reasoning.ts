import type { ModelConfig } from "../constants/env";

type ReasoningSummary = "auto" | "concise" | "detailed";
type ReasoningEffort = "low" | "medium" | "high" | "minimal" | "xhigh" | "none";

type ContentBlock = {
  type?: string;
  text?: unknown;
  reasoning?: unknown;
};

type ChunkLike = {
  content?: unknown;
  additional_kwargs?: Record<string, any>;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isOfficialOpenAIProvider(config: Pick<ModelConfig, "provider" | "baseUrl">): boolean {
  const provider = config.provider?.trim().toLowerCase();
  if (provider === "openai") return true;

  try {
    const host = new URL(config.baseUrl || "https://api.openai.com/v1").hostname.toLowerCase();
    return host === "api.openai.com" || host.endsWith(".openai.com");
  } catch {
    return false;
  }
}

function supportsReasoningOutput(modelName: string): boolean {
  const model = modelName.trim().toLowerCase();
  return /^(gpt-5|o1|o3|o4|computer-use-preview)/.test(model);
}

function getRecommendedReasoningEffort(modelName: string): ReasoningEffort | undefined {
  const model = modelName.trim().toLowerCase();
  if (model.startsWith("gpt-5.1")) return "low";
  return undefined;
}

export function getReasoningOptionsForModel(
  config: Pick<ModelConfig, "provider" | "baseUrl" | "modelName">,
  scope: "main" | "background",
): { summary: ReasoningSummary; effort?: ReasoningEffort } | undefined {
  if (scope !== "main") return undefined;
  if (!isOfficialOpenAIProvider(config)) return undefined;
  if (!supportsReasoningOutput(config.modelName || "")) return undefined;

  return {
    summary: "auto",
    ...(getRecommendedReasoningEffort(config.modelName || "")
      ? { effort: getRecommendedReasoningEffort(config.modelName || "") }
      : {}),
  };
}

function getContentBlocks(content: unknown): ContentBlock[] {
  return Array.isArray(content) ? content : [];
}

export function extractTextDeltaFromChunk(chunk: ChunkLike): string {
  if (typeof chunk.content === "string") {
    return chunk.content;
  }

  const textFromBlocks = getContentBlocks(chunk.content)
    .map((part) => {
      if (part?.type === "text" || part?.type === "output_text") {
        return normalizeText(part.text);
      }
      return "";
    })
    .join("");

  return textFromBlocks;
}

export function extractThinkingDeltaFromChunk(chunk: ChunkLike): string {
  const thinkingFromBlocks = getContentBlocks(chunk.content)
    .map((part) => {
      if (part?.type === "reasoning") {
        return normalizeText(part.reasoning);
      }
      if (part?.type === "reasoning_text") {
        return normalizeText(part.text);
      }
      return "";
    })
    .join("");

  if (thinkingFromBlocks) return thinkingFromBlocks;

  const summary = chunk.additional_kwargs?.reasoning?.summary;
  if (!Array.isArray(summary)) return "";
  return summary
    .map((item: any) => normalizeText(item?.text))
    .join("");
}
