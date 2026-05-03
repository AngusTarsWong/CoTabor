import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../../shared/constants/env";
import { getLlmClientHeaders } from "../../../shared/utils/llm-headers";
import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import type { SchedulerRuntimeState } from "../types/SchedulerState";
import type { TaskGraphSubtaskResult } from "../types/TaskGraph";
import type { SubtaskDag } from "../types/SubtaskDag";
import { dagResultResolverPrompt, resolveSystem } from "../../../prompts";

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
  const topoOrder = subtaskDag.topoOrder ?? Object.keys(subtaskDag.nodes);
  const subtaskResultLines = topoOrder.map((id) => {
    const node = subtaskDag.nodes[id];
    const result = subtaskResults[id];
    const dependsOn = node.dependsOn.length > 0 ? ` dependsOn=[${node.dependsOn.join(", ")}]` : "";
    if (!result) return `- ${node.title} (${id}) status=missing${dependsOn}`;
    if (result.success) return `- ${node.title} (${id}) status=success${dependsOn}\n  summary: ${result.summary || "(empty)"}`;
    return `- ${node.title} (${id}) status=failed${dependsOn}\n  error: ${result.error || "(empty)"}`;
  }).join("\n");

  const promptVars = {
    goal,
    dagStatusLine: `completed=[${schedulerRuntime.completed.join(", ")}], failed=[${schedulerRuntime.failed.join(", ")}], blocked=[${schedulerRuntime.blocked.join(", ")}]`,
    subtaskResultLines,
  };

  return [
    ["system", resolveSystem(dagResultResolverPrompt, promptVars)],
    ["human", dagResultResolverPrompt.user(promptVars)],
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
      configuration: { 
        baseURL: config.baseUrl,
        defaultHeaders: getLlmClientHeaders()
      },
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
