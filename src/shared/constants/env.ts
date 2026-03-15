/**
 * 环境配置统一入口
 * 兼容 Node.js 运行环境 (tsx) 和 浏览器插件运行环境 (WXT/Vite)
 */

// 规避 TS 对 import.meta 的类型检查
const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
const isBrowserEnv = metaEnv !== undefined;

export const ENV = {
  get LLM_PROVIDER(): string {
    return isBrowserEnv ? metaEnv.VITE_LLM_PROVIDER : process.env.VITE_LLM_PROVIDER || "";
  },
  
  get LLM_API_KEY(): string {
    return isBrowserEnv ? metaEnv.VITE_LLM_API_KEY : process.env.VITE_LLM_API_KEY || "";
  },

  get LLM_BASE_URL(): string {
    return isBrowserEnv ? metaEnv.VITE_LLM_BASE_URL : process.env.VITE_LLM_BASE_URL || "";
  },

  get LLM_MODEL(): string {
    return isBrowserEnv ? metaEnv.VITE_LLM_MODEL : process.env.VITE_LLM_MODEL || "";
  }
};
