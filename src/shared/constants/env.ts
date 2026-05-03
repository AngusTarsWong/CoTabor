/**
 * Unified environment/config entrypoint.
 * Supports both Node.js scripts and the browser extension runtime.
 */

// Avoid strict typing issues around `import.meta`.
const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
const isBrowserEnv = metaEnv !== undefined;

let dynamicConfig: Record<string, string> = {};

export function setDynamicConfig(
  config: Record<string, string>,
  options?: { replace?: boolean }
) {
  dynamicConfig = options?.replace ? { ...config } : { ...dynamicConfig, ...config };
}

export async function loadDynamicConfig() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get(['llmConfig']);
    setDynamicConfig(res.llmConfig || {}, { replace: true });
  }
}

function getProcessEnvValue(key: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const env = process.env as any;
  const explicitEnv: Record<string, string | undefined> = {
    VITE_LLM_PROVIDER: env.VITE_LLM_PROVIDER,
    VITE_LLM_API_KEY: env.LLM_API_KEY || env.VITE_LLM_API_KEY,
    VITE_LLM_BASE_URL: env.VITE_LLM_BASE_URL,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PLANNER_PROVIDER: env.VITE_LLM_PLANNER_PROVIDER,
    VITE_LLM_PLANNER_API_KEY: env.LLM_PLANNER_API_KEY || env.VITE_LLM_PLANNER_API_KEY,
    VITE_LLM_PLANNER_BASE_URL: env.VITE_LLM_PLANNER_BASE_URL,
    VITE_LLM_PLANNER_MODEL: env.VITE_LLM_PLANNER_MODEL,
    VITE_LLM_PLANNER_ENABLE: env.VITE_LLM_PLANNER_ENABLE,
    VITE_LLM_CORTEX_PROVIDER: env.VITE_LLM_CORTEX_PROVIDER,
    VITE_LLM_CORTEX_API_KEY: env.LLM_CORTEX_API_KEY || env.VITE_LLM_CORTEX_API_KEY,
    VITE_LLM_CORTEX_BASE_URL: env.VITE_LLM_CORTEX_BASE_URL,
    VITE_LLM_CORTEX_MODEL: env.VITE_LLM_CORTEX_MODEL,
    VITE_LLM_CORTEX_ENABLE: env.VITE_LLM_CORTEX_ENABLE,
    VITE_LLM_WATCHDOG_PROVIDER: env.VITE_LLM_WATCHDOG_PROVIDER,
    VITE_LLM_WATCHDOG_API_KEY: env.LLM_WATCHDOG_API_KEY || env.VITE_LLM_WATCHDOG_API_KEY,
    VITE_LLM_WATCHDOG_BASE_URL: env.VITE_LLM_WATCHDOG_BASE_URL,
    VITE_LLM_WATCHDOG_MODEL: env.VITE_LLM_WATCHDOG_MODEL,
    VITE_LLM_WATCHDOG_ENABLE: env.VITE_LLM_WATCHDOG_ENABLE,
    VITE_MULTI_AGENT_SCHEDULER: env.VITE_MULTI_AGENT_SCHEDULER,
    VITE_LARK_APP_ID: env.LARK_APP_ID || env.VITE_LARK_APP_ID,
    VITE_LARK_APP_SECRET: env.LARK_APP_SECRET || env.VITE_LARK_APP_SECRET,
    VITE_NOTION_CLIENT_ID: env.NOTION_CLIENT_ID || env.VITE_NOTION_CLIENT_ID,
    VITE_NOTION_CLIENT_SECRET: env.NOTION_CLIENT_SECRET || env.VITE_NOTION_CLIENT_SECRET,
  };
  return explicitEnv[key] ?? env[key];
}

/**
 * Read configuration with this precedence:
 * runtime overrides -> browser meta env -> Node.js process env.
 */
function getEnv(key: string, defaultValue: string = ""): string {
  if (dynamicConfig[key] !== undefined && dynamicConfig[key] !== null && dynamicConfig[key] !== "") {
    return dynamicConfig[key];
  }
  if (isBrowserEnv && metaEnv) {
    const metaValue = metaEnv[key];
    if (metaValue !== undefined && metaValue !== null && metaValue !== "") {
      return metaValue;
    }
  }
  const processValue = getProcessEnvValue(key);
  if (processValue !== undefined && processValue !== null && processValue !== "") {
    return processValue;
  }
  return defaultValue;
}

function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const val = getEnv(key);
  if (!val) return defaultValue;
  return val.toLowerCase() === "true";
}

/** Structured model configuration. */
export interface ModelConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  enabled: boolean;
}

/**
 * Build a model configuration with inheritance and fallback.
 * Priority: lane-specific values override the shared base config.
 */
function createModelConfig(prefix: string, fallback: Partial<ModelConfig>): ModelConfig {
  const provider = getEnv(`VITE_LLM_${prefix}_PROVIDER`) || fallback.provider || "";
  const apiKey = getEnv(`VITE_LLM_${prefix}_API_KEY`) || fallback.apiKey || "";
  const baseUrl = getEnv(`VITE_LLM_${prefix}_BASE_URL`) || fallback.baseUrl || "";
  const modelName = getEnv(`VITE_LLM_${prefix}_MODEL`) || fallback.modelName || "";
  const enabled = getBoolEnv(`VITE_LLM_${prefix}_ENABLE`, true);

  return { provider, apiKey, baseUrl, modelName, enabled };
}

function getBaseConfig(): Partial<ModelConfig> {
  return {
    provider: getEnv("VITE_LLM_PROVIDER", "openai"),
    apiKey: getEnv("VITE_LLM_API_KEY", ""),
    baseUrl: getEnv("VITE_LLM_BASE_URL", "https://api.openai.com/v1"),
    modelName: getEnv("VITE_LLM_MODEL", "gpt-4o"),
    enabled: true,
  };
}

export const ENV = {
  // Base fields kept for backward compatibility.
  get LLM_PROVIDER(): string { return getEnv("VITE_LLM_PROVIDER", "openai"); },
  get LLM_API_KEY(): string { return getEnv("VITE_LLM_API_KEY", ""); },
  get LLM_BASE_URL(): string { return getEnv("VITE_LLM_BASE_URL", "https://api.openai.com/v1"); },
  get LLM_MODEL(): string { return getEnv("VITE_LLM_MODEL", "gpt-4o"); },

  // --- Lane-specific configs ---

  // Planner: heavier reasoning.
  get PLANNER_CONFIG(): ModelConfig {
    return createModelConfig("PLANNER", getBaseConfig());
  },

  // Cortex: mid-tier reasoning with multimodal support.
  get CORTEX_CONFIG(): ModelConfig {
    return createModelConfig("CORTEX", getBaseConfig());
  },

  // Watchdog: lighter multimodal model.
  get WATCHDOG_CONFIG(): ModelConfig {
    return createModelConfig("WATCHDOG", getBaseConfig());
  },

  // Midsense perception-layer config.
  get MIDSENSE_CONFIG() {
    return {
      apiKey:  getEnv("VITE_MIDSENSE_API_KEY", ""),
      baseUrl: getEnv("VITE_MIDSENSE_BASE_URL", ""),
      model:   getEnv("VITE_MIDSENSE_MODEL", "ui-tars-7b"),
    };
  },

  // --- Debug and media switches ---
  get DEBUG_MODE(): boolean {
    return getBoolEnv("VITE_DEBUG_MODE", false);
  },
  get MEDIA_CAPTURE_ON_FAIL(): boolean {
    return getBoolEnv("VITE_MEDIA_CAPTURE_ON_FAIL", false);
  },
  get MULTI_AGENT_SCHEDULER(): boolean {
    return getBoolEnv("VITE_MULTI_AGENT_SCHEDULER", false);
  },

  // --- Notion OAuth ---
  get NOTION_CLIENT_ID(): string {
    return getEnv("VITE_NOTION_CLIENT_ID", "");
  },
  get NOTION_CLIENT_SECRET(): string {
    return getEnv("VITE_NOTION_CLIENT_SECRET", "");
  },

  // --- Lark / Feishu ---
  get LARK_APP_ID(): string {
    return getEnv("VITE_LARK_APP_ID", "");
  },
  get LARK_APP_SECRET(): string {
    return getEnv("VITE_LARK_APP_SECRET", "");
  },
  get LARK_AUTH_PATH(): string {
    // Local cache file path. This file is gitignored and must never be committed.
    return ".lark_auth.json";
  },
  // Node.js scripts can inject tokens directly via env vars without local files.
  get LARK_ACCESS_TOKEN(): string {
    return getEnv("LARK_ACCESS_TOKEN", "");
  },
  get LARK_REFRESH_TOKEN(): string {
    return getEnv("LARK_REFRESH_TOKEN", "");
  },
  get LARK_EXPIRES_AT(): number {
    return Number(getEnv("LARK_EXPIRES_AT", "0"));
  },
  get LARK_REFRESH_EXPIRES_AT(): number {
    return Number(getEnv("LARK_REFRESH_EXPIRES_AT", "0"));
  },
  get LARK_SITES_FOLDER(): string {
    return getEnv("VITE_LARK_SITES_FOLDER", "");
  },
  get LARK_TASKS_FOLDER(): string {
    return getEnv("VITE_LARK_TASKS_FOLDER", "");
  }
};
