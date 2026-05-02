import type { PromptTemplate } from "../types";

export interface ExperienceSummarizerPromptVars {
  isFailed: boolean;
  failureInsightInstruction: string;
  failureInsightSchema: string;
  langInstruction: string;
  ltmSummary: string;
  trajectoryLog: string;
}

/**
 * Global reflection prompt: extracts high-value experience from a completed task run.
 * Produces structured JSON with site insights, tool insights, task wisdom, and (on failure)
 * failure insights.
 */
export const experienceSummarizerPrompt: PromptTemplate<ExperienceSummarizerPromptVars> = {
  system: (vars) => `你是一个高级 AI 复盘专家（Global Reflection Agent）。
当前任务已经结束（${vars.isFailed ? "失败" : "成功"}）。你的任务是根据整个执行流水账，提取全局的高价值经验，并对任务结果进行整体总结。

提取目标：
1. **global_summary**: 简要总结本次任务最终完成了什么，结果如何。如果失败，说明失败在了哪一步。(50字以内)
2. **site_insights**: 页面/站点操作层经验，关注 DOM 交互、点击、输入、等待、页面特性。没有则返回空数组。
3. **tool_insights**: skill / API / MCP 调用层经验，关注参数约束、调用顺序、接口坑点。没有则返回空数组。
4. **task_wisdom**: 任务策略层经验，关注 SOP、规划顺序、宏观避坑。没有则返回空数组。
${vars.failureInsightInstruction}

输出严格的 JSON 格式：
{
  "global_summary": string,
  "site_insights": [{"domain": string, "content": string}],
  "tool_insights": [{"skillName": string, "content": string}],
  "task_wisdom": string[]${vars.failureInsightSchema}
}${vars.langInstruction}`,

  user: (vars) => `
最终任务状态: ${vars.isFailed ? "彻底失败 (FAILED) - 请重点总结为何会失败，应该如何避坑" : "成功完成 (FINISHED) - 请总结成功经验"}

长期摘要 (Long Term Summary):
---
${vars.ltmSummary || "无"}
---

最近关键执行流水账 (Recent Trajectory):
---
${vars.trajectoryLog}
---

请提取高价值经验（无价值则留空）。仅输出 JSON。`,
};
