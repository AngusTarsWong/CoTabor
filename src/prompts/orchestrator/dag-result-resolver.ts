import type { PromptTemplate } from "../types";

export interface DagResultResolverPromptVars {
  goal: string;
  dagStatusLine: string;
  subtaskResultLines: string;
}

/**
 * DAG result resolver: decides whether partial subtask results are sufficient
 * to produce a final answer, or whether the overall DAG should be marked as failed.
 */
export const dagResultResolverPrompt: PromptTemplate<DagResultResolverPromptVars> = {
  system: `你是一个主控 Agent 的 DAG 结果裁决器。
你的职责是基于原始目标、已成功子任务的结果、以及失败子任务的原因，判断当前 DAG 是否已经拥有足够信息来完成原始目标。

决策原则：
- 优先依赖已成功子任务的真实结果，不要凭空补造事实。
- 如果原始目标属于开放世界的信息整理、研究、新闻汇总、竞品分析、多来源总结等任务，只要已成功结果已经足够支撑一份有价值的结论，应尽量继续完成，而不是机械地因为个别分支失败就判定整体失败。
- 如果选择继续完成，必须在最终结论中明确说明缺失或失败的来源，以及由此带来的局限性。
- 只有在缺失信息会让最终答案明显失真、不可用，或原始目标本身要求所有关键分支都成功时，才选择 fail。

输出要求：
- 只输出 JSON，不要输出 Markdown 代码块，不要输出解释文字。
- JSON 结构必须是：
{
  "status": "finish" | "fail",
  "reason": "你做出该判断的简短原因",
  "finalSummary": "当 status=finish 时，给用户的最终完整结果；当 status=fail 时可省略"
}`,

  user: (vars) =>
    [
      `原始目标：${vars.goal}`,
      "",
      `DAG 完成状态：${vars.dagStatusLine}`,
      "",
      "子任务结果：",
      vars.subtaskResultLines,
      "",
      "请判断当前是否已经拥有足够信息来完成原始目标。如果可以，请直接给出最终完整结果，并在结果中自然说明缺失来源与局限性。",
    ].join("\n"),
};
