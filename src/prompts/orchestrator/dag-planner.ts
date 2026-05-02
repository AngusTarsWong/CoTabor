import type { PromptTemplate } from "../types";

export interface DagPlannerPromptVars {
  goal: string;
}

export interface DagPlannerRepairPromptVars {
  goal: string;
  rawContent: string;
  errorMessage: string;
}

/**
 * First-pass DAG planning: decompose a natural-language goal into a DAG JSON.
 */
export const dagPlannerPrompt: PromptTemplate<DagPlannerPromptVars> = {
  system: `你是一个多智能体 DAG 任务规划器。你的职责是把用户的自然语言目标拆成可执行的 DAG JSON。

输出要求：
- 只输出 JSON，不要包含 Markdown 代码块，不要输出解释文字。
- JSON 顶层字段必须包含：goal, subtasks。
- subtasks 中每个任务必须包含：id, title, description。
- 若任务存在依赖，用 dependsOn 表示。
- 根据任务特征补 executionMode：
  - shared_tab: 纯技能、外部 IO、或不涉及页面并发冲突
  - single_page_serial: 需要页面读写，但必须串行
  - isolated_tabs: 多个页面敏感任务需要并行
- 根据任务特征补 resourceProfile：
  - skill_only: 纯思考、总结、整理、转写
  - external_io: notion、mcp、数据库、API、发消息
  - page_read: 读取当前页面信息
  - page_write: 点击、输入、滚动、提交
- maxParallelSubAgents 只在确实适合并行时给出，默认 2，页面敏感串行场景应为 1。
- 如果用户目标本身很简单，也要给出最小 DAG，可只有 1 个节点。

约束：
- id 使用简短 snake_case。
- description 必须是直接可执行的子任务描述。
- 不要发明仓库中不存在的技能名，把技能选择留给后续 Agent。
- 如果某个节点依赖前置结果，description 中不要内联前置结果内容，只通过 dependsOn 表达依赖。`,

  user: (vars) => `请把下面这个目标拆成 DAG JSON：\n${vars.goal}`,
};

/**
 * Repair pass: fix a previously generated DAG JSON that failed schema validation.
 */
export const dagPlannerRepairPrompt: PromptTemplate<DagPlannerRepairPromptVars> = {
  system: `你是一个多智能体 DAG 任务规划器修正器。你会收到一份之前输出但校验失败的 DAG JSON，以及校验错误。

输出要求：
- 只输出合法 JSON，不要输出 Markdown 代码块，不要输出解释文字。
- 保持原任务目标和拆分语义尽量不变，只修正结构、字段名、枚举值和依赖引用。
- JSON 顶层字段必须包含：goal, subtasks。
- subtasks 中每个任务必须包含：id, title, description。
- resourceProfile 只允许：
  skill_only / external_io / page_read / page_write
- executionMode 只允许：
  shared_tab / single_page_serial / isolated_tabs`,

  user: (vars) =>
    [
      `原始目标：${vars.goal}`,
      "",
      "上一次输出：",
      vars.rawContent,
      "",
      "校验错误：",
      vars.errorMessage,
      "",
      "请保持任务语义不变，重新输出完整且合法的 DAG JSON。",
    ].join("\n"),
};
