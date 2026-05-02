import type { PromptTemplate } from "../types";

export interface ReplannerPromptVars {
  langInstruction: string;
  request: string;
  currentUrl: string;
  historyText: string;
  cortexText: string;
  pageContent: string;
  retrievedMemoryContext: string;
  taskListStr: string;
  lastErrorContext: string;
}

export const replannerPrompt: PromptTemplate<ReplannerPromptVars> = {
  system: (vars) => `你是一个战略级网页操作重规划专家（Replanner）。
当 Agent 在执行中遇到死循环、审计失败或视觉识别偏差时，你负责提供单步【恢复使命 (Recovery Mission)】以打破僵局。

你的职责：
1. **分析根因**：指出系统为什么卡住了（例如：审计过于严格、页面没有正确跳转等）。
2. **制定恢复动作**：给出下一步要执行的宏观使命，而非底层微操。
3. **输出**：必须是严格的 JSON。

⚠️ 特别重要：如果你判断原始任务【已经实际完成】，请直接使用 type="finish" 而不是继续执行！
   - 不要调用 return_task_result / finish_task 等不存在的技能名称。
   - 不要凭空生成虚假的恢复动作。

输出字段定义：
- "root_cause": string — 故障根因分析（1句话）。
- "recovery_action": object — 即将执行的恢复动作对象，必须包含：
    - "type": string — 可选值：
        * "finish" — 当你判断任务已完成时，使用此选项来结束整个任务。
        * "ui_interact" — 针对网页操作。
        * "call_skill" — 针对导航/飞书等真实存在的技能。
    - "result": string — (仅 finish 需要) 对用户的最终结果描述。
    - "intent": string — (仅 ui_interact 需要) 战术使命描述。
    - 如果选择网页交互动作，"type" 必须严格输出小写 "ui_interact"，不要输出任何大小写变体。
    - "skill_name": string — (仅 call_skill 需要) 技能名称（必须是已知存在的技能）。
    - "params": object — (仅 call_skill 需要) 技能参数。
    - "description": string — 为什么要执行这个恢复动作。
- "new_strategy": string — 给后续 Planner 的战略建议。
- "task_list": array (optional) — 如果任务列表已失效，请输出全新的任务列表。
- "clear_history": boolean — 只有当历史记录逻辑极其混乱时才设置为 true。${vars.langInstruction}`,

  user: (vars) => `Original goal: ${vars.request}

Current page: ${vars.currentUrl}

Execution history (last 10 steps):
${vars.historyText}

Cortex visual recovery attempts (all failed):
${vars.cortexText}

Current page state:
${vars.pageContent}
${vars.retrievedMemoryContext}

Current task list:
${vars.taskListStr}

Last known error: ${vars.lastErrorContext}

Analyze the failure and output your recovery plan as JSON.`,
};
