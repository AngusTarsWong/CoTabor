export interface MidsceneRuntimeConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  modelFamily?: string;
}

export const MIDSCENE_MODEL_FAMILY_OPTIONS = [
  "qwen2.5-vl",
  "qwen3-vl",
  "qwen3.5",
  "doubao-vision",
  "doubao-seed",
  "gemini",
  "vlm-ui-tars",
  "vlm-ui-tars-doubao",
  "vlm-ui-tars-doubao-1.5",
  "glm-v",
  "auto-glm",
  "auto-glm-multilingual",
  "gpt-5",
] as const;

export function inferMidsceneModelFamily(modelName: string): string {
  const normalized = modelName.trim().toLowerCase();
  if (!normalized) return "vlm-ui-tars";
  if (normalized.includes("qwen3.5")) return "qwen3.5";
  if (normalized.includes("qwen3")) return "qwen3-vl";
  if (normalized.includes("qwen")) return "qwen2.5-vl";
  if (normalized.includes("doubao-seed")) return "doubao-seed";
  if (normalized.includes("doubao")) return "doubao-vision";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("auto-glm")) return "auto-glm";
  if (normalized.includes("glm")) return "glm-v";
  if (normalized.includes("gpt-5")) return "gpt-5";
  if (normalized.includes("ui-tars") && normalized.includes("doubao")) return "vlm-ui-tars-doubao-1.5";
  if (normalized.includes("ui-tars")) return "vlm-ui-tars";
  return "vlm-ui-tars";
}

export function buildMidsceneModelConfig(config: MidsceneRuntimeConfig): Record<string, string> {
  const apiKey = config.apiKey.trim();
  const baseUrl = config.baseUrl?.trim() ?? "";
  const modelName = config.model?.trim() || "ui-tars-7b";
  const modelFamily = config.modelFamily?.trim();

  const modelConfig: Record<string, string> = {
    MIDSCENE_MODEL_NAME: modelName,
    MIDSCENE_MODEL_API_KEY: apiKey,
    MIDSCENE_MODEL_BASE_URL: baseUrl,
    // Midscene still supports these OpenAI-compatible aliases on the default
    // path; keeping them makes provider behavior stable across SDK releases.
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
  };

  if (modelFamily) {
    modelConfig.MIDSCENE_MODEL_FAMILY = modelFamily;
  }

  return modelConfig;
}
