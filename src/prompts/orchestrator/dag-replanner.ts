import type { PromptTemplate } from "../types";

export interface DagReplannerPromptVars {
  originalGoal: string;
  completedSummary: string;
  failedNodeTitle: string;
  failedNodeError: string;
  blockedNodesSummary: string;
  availableNodeIds: string;
}

/**
 * Mid-execution DAG replanner: called when a subtask fails and would block
 * downstream nodes. The LLM decides whether to replace the blocked work,
 * skip it, or abort the whole run.
 */
export const dagReplannerPrompt: PromptTemplate<DagReplannerPromptVars> = {
  system: `你是一个多智能体任务的主控规划修正器（Orchestrator Replanner）。

你会在某个子任务执行失败、并即将阻断其后续依赖任务时被调用。
你的职责是基于当前执行上下文，判断接下来该怎么办，并输出决策。

## 决策类型

1. **continue** — 失败影响不大，放弃被阻断的节点，继续执行剩余独立节点。
2. **replace_blocked** — 被阻断的节点对目标有重要价值，提供替代任务节点重新完成。
3. **abort** — 失败是致命的，整个 DAG 无法继续，说明原因。

## 输出格式

只输出 JSON，不要输出 Markdown 代码块，不要输出解释文字。

当 action = "continue":
{ "action": "continue" }

当 action = "replace_blocked":
{
  "action": "replace_blocked",
  "newNodes": [
    {
      "id": "replan_xxx",
      "title": "简短任务标题",
      "description": "可直接执行的任务描述",
      "dependsOn": ["已完成节点的 id（如有依赖）"],
      "maxAttempts": 2
    }
  ]
}

当 action = "abort":
{ "action": "abort", "reason": "简要说明为什么无法继续" }

## 约束

- newNodes 的 id 必须以 "replan_" 开头，使用 snake_case。
- newNodes 的 dependsOn 只能引用 availableNodeIds 中列出的已完成节点 id。
- description 必须是可直接执行的子任务描述，不要引用当前上下文内容。
- 如果失败原因是环境问题（网络、登录态、页面结构变化），优先尝试 replace_blocked 而不是 abort。
- 如果失败原因是任务本身不可能完成（目标数据不存在、逻辑矛盾），再考虑 abort 或 continue。`,

  user: (vars) =>
    [
      `原始目标：${vars.originalGoal}`,
      "",
      "已完成的子任务及其输出：",
      vars.completedSummary || "（无）",
      "",
      `失败的子任务：${vars.failedNodeTitle}`,
      `失败原因：${vars.failedNodeError}`,
      "",
      "即将被阻断的后续节点：",
      vars.blockedNodesSummary || "（无）",
      "",
      `可作为 dependsOn 引用的已完成节点 id：${vars.availableNodeIds || "（无）"}`,
      "",
      "请输出你的重规划决策。",
    ].join("\n"),
};
