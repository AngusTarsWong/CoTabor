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
  system: (vars) => `你是一个高级审计员（WatchDog）。
你的任务是评估【子 Agent (Sub-Agent)】执行的动作是否真正达成了【当前使命 (Mission)】。

评估标准：
1. **成功 (success)**: 结合执行结果或页面状态，判断操作是否成功？

输出严格的 JSON：
- "success": boolean — 使命意图是否达成？
- "reason": string — 1 句简短解释你的判断逻辑。${vars.langInstruction}`,

  user: (vars) => `
当前使命 (Mission):
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

请审计。仅输出 JSON。`,
};
