/**
 * 环境配置统一入口
 * 兼容 Node.js 运行环境 (tsx) 和 浏览器插件运行环境 (WXT/Vite)
 */

// 规避 TS 对 import.meta 的类型检查
const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
const isBrowserEnv = metaEnv !== undefined;

function getProcessEnvValue(key: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const env = process.env as any;
  const explicitEnv: Record<string, string | undefined> = {
    VITE_LLM_PROVIDER: env.VITE_LLM_PROVIDER,
    VITE_LLM_API_KEY: env.VITE_LLM_API_KEY,
    VITE_LLM_BASE_URL: env.VITE_LLM_BASE_URL,
    VITE_LLM_MODEL: env.VITE_LLM_MODEL,
    VITE_LLM_PLANNER_PROVIDER: env.VITE_LLM_PLANNER_PROVIDER,
    VITE_LLM_PLANNER_API_KEY: env.VITE_LLM_PLANNER_API_KEY,
    VITE_LLM_PLANNER_BASE_URL: env.VITE_LLM_PLANNER_BASE_URL,
    VITE_LLM_PLANNER_MODEL: env.VITE_LLM_PLANNER_MODEL,
    VITE_LLM_PLANNER_ENABLE: env.VITE_LLM_PLANNER_ENABLE,
    VITE_LLM_CORTEX_PROVIDER: env.VITE_LLM_CORTEX_PROVIDER,
    VITE_LLM_CORTEX_API_KEY: env.VITE_LLM_CORTEX_API_KEY,
    VITE_LLM_CORTEX_BASE_URL: env.VITE_LLM_CORTEX_BASE_URL,
    VITE_LLM_CORTEX_MODEL: env.VITE_LLM_CORTEX_MODEL,
    VITE_LLM_CORTEX_ENABLE: env.VITE_LLM_CORTEX_ENABLE,
    VITE_LLM_WATCHDOG_PROVIDER: env.VITE_LLM_WATCHDOG_PROVIDER,
    VITE_LLM_WATCHDOG_API_KEY: env.VITE_LLM_WATCHDOG_API_KEY,
    VITE_LLM_WATCHDOG_BASE_URL: env.VITE_LLM_WATCHDOG_BASE_URL,
    VITE_LLM_WATCHDOG_MODEL: env.VITE_LLM_WATCHDOG_MODEL,
    VITE_LLM_WATCHDOG_ENABLE: env.VITE_LLM_WATCHDOG_ENABLE,
    VITE_DEBUG_MODE: env.VITE_DEBUG_MODE,
    VITE_MEDIA_CAPTURE_ON_FAIL: env.VITE_MEDIA_CAPTURE_ON_FAIL,
  };
  return explicitEnv[key] ?? env[key];
}

/**
 * 帮助函数：读取环境变量，优先读取 metaEnv (浏览器)，其次读取 process.env (Node)
 */
function getEnv(key: string, defaultValue: string = ""): string {
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

/**
 * 模型配置接口
 */
export interface ModelConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  enabled: boolean;
}

/**
 * 构造模型配置，支持继承与回退 (Fallback Strategy)
 * 优先级: 特定档位配置 > 全局基础配置
 */
function createModelConfig(prefix: string, fallback: Partial<ModelConfig>): ModelConfig {
  const provider = getEnv(`VITE_LLM_${prefix}_PROVIDER`) || fallback.provider || "";
  const apiKey = getEnv(`VITE_LLM_${prefix}_API_KEY`) || fallback.apiKey || "";
  const baseUrl = getEnv(`VITE_LLM_${prefix}_BASE_URL`) || fallback.baseUrl || "";
  const modelName = getEnv(`VITE_LLM_${prefix}_MODEL`) || fallback.modelName || "";
  const enabled = getBoolEnv(`VITE_LLM_${prefix}_ENABLE`, true);

  return { provider, apiKey, baseUrl, modelName, enabled };
}

// 1. 获取全局基础配置
const BASE_PROVIDER = getEnv("VITE_LLM_PROVIDER", "openai");
const BASE_API_KEY = getEnv("VITE_LLM_API_KEY", "");
const BASE_BASE_URL = getEnv("VITE_LLM_BASE_URL", "https://api.openai.com/v1");
const BASE_MODEL = getEnv("VITE_LLM_MODEL", "gpt-4o");

const baseConfig: Partial<ModelConfig> = {
  provider: BASE_PROVIDER,
  apiKey: BASE_API_KEY,
  baseUrl: BASE_BASE_URL,
  modelName: BASE_MODEL,
  enabled: true
};

export const ENV = {
  // 基础配置暴露 (兼容旧代码)
  get LLM_PROVIDER(): string { return BASE_PROVIDER; },
  get LLM_API_KEY(): string { return BASE_API_KEY; },
  get LLM_BASE_URL(): string { return BASE_BASE_URL; },
  get LLM_MODEL(): string { return BASE_MODEL; },

  // --- 档位配置 (Structured Configs) ---

  // 1. Planner (深度思考)
  get PLANNER_CONFIG(): ModelConfig {
    return createModelConfig("PLANNER", baseConfig);
  },

  // 2. Cortex (中等思考+多模态)
  get CORTEX_CONFIG(): ModelConfig {
    return createModelConfig("CORTEX", baseConfig);
  },

  // 3. Watchdog (基础多模态)
  get WATCHDOG_CONFIG(): ModelConfig {
    return createModelConfig("WATCHDOG", baseConfig);
  },

  // 4. Midsense 感知层配置
  get MIDSENSE_CONFIG() {
    return {
      apiKey:  getEnv("VITE_MIDSENSE_API_KEY", ""),
      baseUrl: getEnv("VITE_MIDSENSE_BASE_URL", ""),
      model:   getEnv("VITE_MIDSENSE_MODEL", "ui-tars-7b"),
    };
  },

  // --- 调试与媒体开关 ---
  get DEBUG_MODE(): boolean {
    return getBoolEnv("VITE_DEBUG_MODE", true);
  },
  get MEDIA_CAPTURE_ON_FAIL(): boolean {
    return getBoolEnv("VITE_MEDIA_CAPTURE_ON_FAIL", true);
  },

  // --- 飞书 (Lark) 配置 ---
  get LARK_APP_ID(): string {
    return getEnv("VITE_LARK_APP_ID", "");
  },
  get LARK_APP_SECRET(): string {
    return getEnv("VITE_LARK_APP_SECRET", "");
  },
  get LARK_AUTH_PATH(): string {
    // 默认为项目根目录下的隐藏文件 (用于 Node.js 环境)
    return ".lark_auth.json";
  },
  get LARK_LOG_FOLDER(): string {
    return getEnv("VITE_LARK_LOG_FOLDER", "");
  }
};
