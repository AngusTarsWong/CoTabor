import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../../shared/constants/env";
import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import type { SchedulerRuntimeState } from "../types/SchedulerState";
import type { TaskGraphSubtaskResult } from "../types/TaskGraph";
import type { SubtaskDag } from "../types/SubtaskDag";

export interface DagResultResolution {
  status: "finish" | "fail";
  reason: string;
  finalSummary?: string;
  tokenUsage?: TokenUsage;
}

export interface DagResultResolverOptions {
  execute?: (
    messages: Array<[string, string]>,
    modelName: string,
  ) => Promise<{ content: string; tokenUsage?: TokenUsage }>;
}

function buildResolutionMessages(
  goal: string,
  schedulerRuntime: SchedulerRuntimeState,
  subtaskDag: SubtaskDag,
  subtaskResults: Record<string, TaskGraphSubtaskResult>,
): Array<[string, string]> {
  const systemPrompt = `你是一个主控 Agent 的 DAG 结果裁决器。
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
}`;

  const orderedNodeLines = subtaskDag.topoOrder.map((id) => {
    const node = subtaskDag.nodes[id];
    const result = subtaskResults[id];
    const dependsOn = node.dependsOn.length > 0 ? ` dependsOn=[${node.dependsOn.join(", ")}]` : "";
    if (!result) {
      return `- ${node.title} (${id}) status=missing${dependsOn}`;
    }
    if (result.success) {
      return `- ${node.title} (${id}) status=success${dependsOn}\n  summary: ${result.summary || "(empty)"}`;
    }
    return `- ${node.title} (${id}) status=failed${dependsOn}\n  error: ${result.error || "(empty)"}`;
  });

  const userPrompt = [
    `原始目标：${goal}`,
    "",
    `DAG 完成状态：completed=[${schedulerRuntime.completed.join(", ")}], failed=[${schedulerRuntime.failed.join(", ")}], blocked=[${schedulerRuntime.blocked.join(", ")}]`,
    "",
    "子任务结果：",
    orderedNodeLines.join("\n"),
    "",
    "请判断当前是否已经拥有足够信息来完成原始目标。如果可以，请直接给出最终完整结果，并在结果中自然说明缺失来源与局限性。",
  ].join("\n");

  return [
    ["system", systemPrompt],
    ["human", userPrompt],
  ];
}

function parseResolution(content: string): DagResultResolution {
  const parsed = JSON.parse(content);
  const status = parsed?.status === "finish" ? "finish" : "fail";
  const reason = typeof parsed?.reason === "string" && parsed.reason.trim()
    ? parsed.reason.trim()
    : status === "finish"
      ? "主控 Agent 认为已有足够信息完成原始目标。"
      : "主控 Agent 认为当前信息不足以完成原始目标。";
  const finalSummary =
    typeof parsed?.finalSummary === "string" && parsed.finalSummary.trim()
      ? parsed.finalSummary.trim()
      : undefined;
  return { status, reason, finalSummary };
}

export async function resolveDagRunOutcome(
  goal: string,
  schedulerRuntime: SchedulerRuntimeState,
  subtaskDag: SubtaskDag,
  subtaskResults: Record<string, TaskGraphSubtaskResult>,
  options: DagResultResolverOptions = {},
): Promise<DagResultResolution> {
  const execute = options.execute ?? (async (messages: Array<[string, string]>, modelName: string) => {
    const config = ENV.PLANNER_CONFIG;
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      timeout: 120000,
    });
    return invokeLLM(llm, messages, "dag_result_resolver", modelName, "main");
  });

  const modelName = ENV.PLANNER_CONFIG.modelName || ENV.LLM_MODEL || "unknown";
  const { content, tokenUsage } = await execute(
    buildResolutionMessages(goal, schedulerRuntime, subtaskDag, subtaskResults),
    modelName,
  );

  return {
    ...parseResolution(content),
    tokenUsage,
  };
}
