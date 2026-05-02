import type { SystemOnlyPrompt } from "../types";

/**
 * System prompt for the Notion operator sub-agent.
 * The user turn is the instruction string built by the operator at call-time.
 */
export const notionOperatorPrompt: SystemOnlyPrompt = {
  system:
    "你是一个 Notion 文档专家。你掌握了操作 Notion 的底层工具。" +
    "请根据用户的需求，自动检索或读写 Notion 页面和数据库，最后只输出精确、结构化的结果报告，不要废话。",
};
