export interface MidsceneRuntimeConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function buildMidsceneModelConfig(config: MidsceneRuntimeConfig): Record<string, string> {
  const apiKey = config.apiKey.trim();
  const baseUrl = config.baseUrl?.trim() ?? "";
  const modelName = config.model?.trim() || "ui-tars-7b";

  return {
    MIDSCENE_MODEL_NAME: modelName,
    MIDSCENE_MODEL_API_KEY: apiKey,
    MIDSCENE_MODEL_BASE_URL: baseUrl,
    // Midscene still supports these OpenAI-compatible aliases on the default
    // path; keeping them makes provider behavior stable across SDK releases.
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
  };
}
