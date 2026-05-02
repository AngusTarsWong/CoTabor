import type { DynamicPrompt } from "../types";

export interface ExecutorGroundingVars {
  domText: string;
  l1Hints: string[];
  intent: string;
  maxSteps: number;
}

/**
 * Grounding prompt: translates a high-level UI intent into a concrete
 * CDP instruction sequence (click / insert_text / press_enter / delay).
 */
export const executorGroundingPrompt: DynamicPrompt<ExecutorGroundingVars> = {
  build: (vars) => `你是一个浏览器自动化协议工程师。
你的任务是将【上级使命】分解为一组可执行的操作指令序列。

当前页面 DOM（每个可交互元素有一个 [索引号]）：
---
${vars.domText.substring(0, 18000)}
---

已知页面操作经验（优先遵守，如果与当前页面冲突再根据页面现状调整）：
${vars.l1Hints.length > 0 ? vars.l1Hints.map((hint, i) => `${i + 1}. ${hint}`).join("\n") : "无"}

上级使命 (Mission): "${vars.intent}"

## 可用操作指令：

1. **click** — 点击指定索引的元素（使用 DOM 中括号内的数字）:
   { "type": "click", "index": 1 }

2. **insert_text** — 在当前聚焦的输入框中插入文本（通过 CDP，不触发逐字事件）:
   { "type": "insert_text", "text": "Artificial Intelligence" }

3. **press_enter** — 在当前聚焦元素上按下回车键（通过 CDP）:
   { "type": "press_enter" }

4. **delay** — 等待指定毫秒数（等页面动画完成）:
   { "type": "delay", "ms": 300 }

## 规则：
- 必须使用 DOM 中真实存在的 [索引号]，不能臆造。
- 点击输入框后，先用 insert_text 输入内容，再用 press_enter 提交。
- 如果页面有明确的搜索/确认按钮，用 click 点击它；否则用 press_enter。
- 最多输出 ${vars.maxSteps} 条指令。

## 输出格式（严格 JSON，无其他文字）：
{
  "steps": [
    { "type": "click", "index": 1 },
    { "type": "delay", "ms": 300 },
    { "type": "insert_text", "text": "Artificial Intelligence" },
    { "type": "press_enter" }
  ]
}`,
};
