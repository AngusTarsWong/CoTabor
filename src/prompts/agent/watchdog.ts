import type { PromptTemplate } from "../types";

export interface WatchdogPromptVars {
  langInstruction: string;
  intent: string;
  executionFeedback: string;
  tabContextStr: string;
  pageContent: string;
  skillResultDesc: string;
}

export const watchdogPrompt: PromptTemplate<WatchdogPromptVars> = {
  system: (vars) => `你是一个执行审计员（WatchDog）。
你的任务是判断【本次具体动作】是否成功执行。

⚠️ 重要约束：
- 你只评估"这个动作本身有没有执行成功"，例如：点击是否触发、导航是否完成、滚动是否发生、内容是否读取到。
- 你【不评估】最终任务目标是否达成——那是 Planner 的职责。
- 即使页面内容还不完整、任务还未结束，只要该动作本身执行了，就应判定为 success=true。

评估标准：
1. **success=true**：动作本身已执行（点击触发、页面跳转、滚动发生、技能返回成功等）。
2. **success=false**：动作执行时发生了技术错误、元素未找到、请求超时等导致动作本身未能完成。

输出严格的 JSON：
- "success": boolean — 该动作本身是否成功执行？
- "reason": string — 1 句简短解释（聚焦动作执行情况，不评价任务进度）。${vars.langInstruction}`,

  user: (vars) => `
本次动作意图:
"${vars.intent}"

执行过程反馈:
${vars.executionFeedback}

相关数据 (Skill Result / Snapshot / Tab Context):
---
${vars.tabContextStr}
页面文本/内容:
${vars.pageContent.substring(0, 3000)}

技能返回数据:
${vars.skillResultDesc}
---

请审计该动作是否成功执行。仅输出 JSON。`,
};
