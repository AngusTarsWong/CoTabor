import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import { createLlmClient, getLaneModelName } from "../../../shared/llm/provider";
import { dagReplannerPrompt } from "../../../prompts";
import { resolveSystem } from "../../../prompts/types";
import type { ReplanContext, ReplanDecision } from "./types";
import type { TaskGraphTaskInput } from "../types/TaskGraph";

export interface ReplanResult {
  decision: ReplanDecision;
  tokenUsage?: TokenUsage;
}

function buildMessages(context: ReplanContext): Array<[string, string]> {
  const completedSummary = context.completedNodes
    .map((n) => `- [${n.id}] ${n.title}${n.summary ? `：${n.summary}` : ""}`)
    .join("\n");

  const blockedNodesSummary = context.blockedNodes
    .map((n) => `- [${n.id}] ${n.title}${n.description ? `：${n.description}` : ""}`)
    .join("\n");

  const availableNodeIds = context.completedNodes.map((n) => n.id).join(", ");

  const vars = {
    originalGoal: context.originalGoal,
    completedSummary,
    failedNodeTitle: context.failedNode.title,
    failedNodeError: context.failedNode.error,
    blockedNodesSummary,
    availableNodeIds,
  };

  return [
    ["system", resolveSystem(dagReplannerPrompt, vars)],
    ["human", dagReplannerPrompt.user(vars)],
  ];
}

function parseDecision(content: string): ReplanDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Malformed JSON — safe fallback: skip blocked nodes and continue.
    console.warn("[OrchestratorReplanner] failed to parse LLM response, defaulting to continue:", content);
    return { action: "continue" };
  }

  const action = parsed?.action;

  if (action === "abort") {
    return {
      action: "abort",
      reason: typeof parsed.reason === "string" ? parsed.reason : "主控 Replanner 判断无法继续执行。",
    };
  }

  if (action === "replace_blocked") {
    const rawNodes = Array.isArray(parsed.newNodes) ? parsed.newNodes : [];
    const newNodes: TaskGraphTaskInput[] = rawNodes
      .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
      .map((n) => ({
        id: typeof n.id === "string" ? n.id : undefined,
        title: typeof n.title === "string" ? n.title : "替代任务",
        description: typeof n.description === "string" ? n.description : undefined,
        dependsOn: Array.isArray(n.dependsOn)
          ? (n.dependsOn as unknown[]).filter((d): d is string => typeof d === "string")
          : [],
        maxAttempts: typeof n.maxAttempts === "number" ? n.maxAttempts : 2,
      }));

    if (newNodes.length === 0) {
      // No valid nodes generated — fall back to continue.
      return { action: "continue" };
    }

    return { action: "replace_blocked", newNodes };
  }

  return { action: "continue" };
}

/**
 * Calls the LLM to decide what to do when a subtask fails and would block
 * downstream nodes. Returns a ReplanDecision the caller can act on immediately.
 */
export async function replanAfterFailure(context: ReplanContext): Promise<ReplanResult> {
  const llm = await createLlmClient("planner", "main", { temperature: 0.1, timeout: 60000 });
  const modelName = getLaneModelName("planner");
  const messages = buildMessages(context);

  const { content, tokenUsage } = await invokeLLM(
    llm,
    messages,
    "orchestrator_replanner",
    modelName,
    "main",
  );

  return {
    decision: parseDecision(content),
    tokenUsage,
  };
}
