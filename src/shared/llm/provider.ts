import { ChatOpenAI } from "@langchain/openai";
import { ENV, loadDynamicConfig } from "../constants/env";
import { getLlmClientHeaders } from "../utils/llm-headers";

export type LlmLane = "planner" | "cortex" | "watchdog";
export type LlmScope = "main" | "background";

export interface LlmClientOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRetries?: number;
}

function getLaneConfig(lane: LlmLane) {
  if (lane === "cortex") return ENV.CORTEX_CONFIG;
  if (lane === "watchdog") return ENV.WATCHDOG_CONFIG;
  return ENV.PLANNER_CONFIG;
}

/**
 * Returns the modelName for a given lane without constructing a client.
 * Useful as the 4th argument to streamLLM / invokeLLM.
 */
export function getLaneModelName(lane: LlmLane): string {
  return getLaneConfig(lane).modelName;
}

/**
 * Async factory for lane-based LLM clients.
 * For background scope, loadDynamicConfig() is called internally so callers
 * never need to remember to do it themselves.
 */
export async function createLlmClient(
  lane: LlmLane,
  scope: LlmScope,
  options: LlmClientOptions = {},
): Promise<ChatOpenAI> {
  if (scope === "background") {
    await loadDynamicConfig().catch(() => {});
  }
  const config = getLaneConfig(lane);
  return new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: {
      baseURL: config.baseUrl,
      defaultHeaders: getLlmClientHeaders(),
    },
    modelName: config.modelName,
    temperature: options.temperature ?? 0.1,
    ...(options.maxTokens !== undefined && { maxTokens: options.maxTokens }),
    ...(options.timeout !== undefined && { timeout: options.timeout }),
    ...(options.maxRetries !== undefined && { maxRetries: options.maxRetries }),
  });
}

export interface LlmClientFromParamsOptions {
  apiKey: string;
  modelName: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRetries?: number;
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
}

/**
 * Sync factory for callers that manage their own config (SubAgentLoop, DistillerLLM).
 * When tools are provided, returns llm.bindTools(tools).
 */
export function createLlmClientFromParams(options: LlmClientFromParamsOptions): ChatOpenAI {
  const { apiKey, modelName, baseUrl, temperature, maxTokens, timeout, maxRetries, tools } = options;
  const llm = new ChatOpenAI({
    apiKey,
    modelName,
    configuration: {
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      defaultHeaders: getLlmClientHeaders(),
    },
    temperature: temperature ?? 0.1,
    ...(maxTokens !== undefined && { maxTokens }),
    ...(timeout !== undefined && { timeout }),
    ...(maxRetries !== undefined && { maxRetries }),
  });
  if (tools && tools.length > 0) {
    return llm.bindTools(tools) as unknown as ChatOpenAI;
  }
  return llm;
}
