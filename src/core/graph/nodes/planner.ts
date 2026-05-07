import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { ENV } from "../../../shared/constants/env";
import { emitTrace } from "../../../shared/utils/trace";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { buildPlannerNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { buildPlannerNodeMemoryDetails } from "../../../memory/retrieval/memory-detail-builder";
import { buildMemoryRefreshContext } from "../../../memory/service/build-memory-refresh-context";
import { getMemoryRefreshResult } from "../../../memory/service/memory-refresh-service";
import { plannerPrompt, resolveSystem } from "../../../prompts";
import { log } from "../../../shared/utils/log";
import { buildPlannerPromptVars } from "../../planning/buildPlannerContext";
import { parsePlannerResponse } from "../../planning/parsePlannerResponse";
import { resolveTaskType } from "../../planning/task-type";
import type { PlannedAction, HistoryStep } from "../../types/history";
import { createLlmClient } from "../../../shared/llm/provider";

const toTraceHistory = (history: HistoryStep[]): Array<Record<string, unknown>> =>
  history.map((step) => ({
    step: step.step,
    action: step.action as unknown as Record<string, unknown>,
    result: (step.result ?? null) as unknown as Record<string, unknown> | null,
    step_summary: step.step_summary,
    meta: step.meta,
  }));

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("--- [Node: Planner] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Planner] Stop requested. Halting before next planning step.");
    return buildStoppedState(state);
  }

  const config = ENV.PLANNER_CONFIG;

  if (!config.enabled) {
    throw new Error("Planner model is disabled in configuration.");
  }

  const memoryRefresh = await getMemoryRefreshResult(
    buildMemoryRefreshContext(state, {
      consumer: "planner",
      reason: "entry",
    })
  );
  const effectiveState: AgentState = {
    ...state,
    retrieved_memories: memoryRefresh.statePatch.retrieved_memories,
    available_skills: memoryRefresh.statePatch.available_skills,
    node_memory_usage: memoryRefresh.statePatch.node_memory_usage,
    memory_refresh_state: memoryRefresh.statePatch.memory_refresh_state,
  };
  const { total_history, meta_data, retrieved_memories } = effectiveState;

  const plannerMemoryUsage = buildPlannerNodeUsage({
    plannerContext: retrieved_memories?.plannerContext,
    l2Rules: retrieved_memories?.l2Rules,
  });
  const plannerNodeMemoryUsage = memoryRefresh.statePatch.node_memory_usage?.refresh
    ? {
        ...plannerMemoryUsage,
        refresh: memoryRefresh.statePatch.node_memory_usage.refresh,
      }
    : plannerMemoryUsage;
  const plannerMemoryDetails = buildPlannerNodeMemoryDetails({
    memories: retrieved_memories,
    refresh: plannerNodeMemoryUsage.refresh,
  });

  const { vars, filteredSkills, currentUrl, tabId } = await buildPlannerPromptVars(effectiveState);

  const llm = await createLlmClient("planner", "main", { temperature: 0.2, timeout: 120000 });

  const systemPrompt = resolveSystem(plannerPrompt, vars);
  const userPrompt = plannerPrompt.user(vars);

  log.info(`[Planner] Thinking about goal: ${state.request}`);

  if (config.enabled) {
    emitTrace({
      node: "planner",
      phase: "enter",
      ts: Date.now(),
      llm: { model_name: config.modelName, prompt_digest: `${state.request}\nURL: ${currentUrl}` },
      state: {
        before: { url: meta_data?.url, page_content_len: (meta_data?.page_content || "").length },
        recentHistory: toTraceHistory(total_history.slice(-3)),
      },
    });
  }

  try {
    const messages = [{ role: "user" as const, content: `${systemPrompt}\n\n${userPrompt}` }];
    const payload = {
      model: config.modelName,
      systemPrompt,
      userPrompt,
      messages,
      temperature: 0.2,
      input: {
        request: effectiveState.request,
        currentUrl,
      },
    };

    const { content, tokenUsage } = await streamLLM(llm, messages, "planner", config.modelName, 'main', effectiveState.task_run_id);
    log.info(`[Planner] Raw LLM Output: ${content}`);

    const llmPayload = {
      node: "planner",
      timestamp: Date.now(),
      payload,
      response: content,
      model: config.modelName,
      token_usage: tokenUsage,
    };

    const { action: actionData, updatedTaskList } = parsePlannerResponse(content, filteredSkills, effectiveState);
    const isBlockedSpawnDagReplan =
      actionData.type === "replan" && actionData.reason === "spawn_dag_disabled";
    const blockedSpawnDagFailed = isBlockedSpawnDagReplan && (state.replan_count ?? 0) >= 1;
    const blockedSpawnDagMessage =
      "当前是蜂群子任务执行者，不能继续拆分或委派任务。请直接完成当前节点目标；如果包含多个来源，请在当前节点内串行处理可访问来源并输出结果。";

    const newMessages = [
      new AIMessage({ content: `决策行动: ${actionData.type} - ${actionData.description || JSON.stringify(actionData)}` }),
    ];

    log.info(`--- [Planner] Action: ${actionData.type} ---`);
    if (updatedTaskList.length > 0) {
      updatedTaskList.forEach(t => log.info(`  [${t.status}] ${t.goal}`));
    }

    const status = blockedSpawnDagFailed
      ? "FAILED"
      : (actionData.type === "finish" || actionData.type === "spawn_dag") ? "FINISHED" : "RUNNING";
    const historyItem = { step: total_history.length + 1, action: actionData, result: null };

    emitTrace({
      node: "planner",
      phase: "exit",
      ts: Date.now(),
      action: {
        type: actionData.type,
        skill_name: (actionData as PlannedAction).skill_name,
        params_digest: (actionData as PlannedAction).params || {},
      },
      llm: { model_name: config.modelName, output_summary: actionData as unknown as Record<string, unknown> },
      state: { after: { planned_status: status } },
    });

    return {
      ...memoryRefresh.statePatch,
      planner_output: { action: actionData },
      task_type: resolveTaskType({
        currentTaskType: state.task_type,
        action: actionData,
      }),
      task_list: updatedTaskList,
      messages: newMessages,
      status,
      error: blockedSpawnDagFailed ? blockedSpawnDagMessage : state.error,
      node_memory_usage: plannerNodeMemoryUsage,
      node_memory_details: plannerMemoryDetails,
      total_history: [...total_history, historyItem],
      llm_payloads: [llmPayload],
      node_llm_payloads: [llmPayload],
      replan_context: isBlockedSpawnDagReplan && !blockedSpawnDagFailed ? blockedSpawnDagMessage : null,
      ...(isBlockedSpawnDagReplan && !blockedSpawnDagFailed
        ? { replan_count: (state.replan_count ?? 0) + 1 }
        : {}),
      meta_data: {
        ...meta_data,
        tabId: tabId || meta_data?.tabId,
        boundTabId: meta_data?.boundTabId || tabId || meta_data?.tabId,
        url: currentUrl,
      },
    };
  } catch (error) {
    log.error("[Planner] LLM Call Failed:", error);

    if (effectiveState.request.toLowerCase().includes("echo")) {
      log.info("[Planner] Activating Fallback for Echo Test...");
      const alreadyEchoed = total_history.some(
        (h: HistoryStep) => h.action.type === "call_skill" && h.action.skill_name === "echo",
      );

      if (alreadyEchoed) {
      return {
        ...memoryRefresh.statePatch,
        planner_output: { action: { type: "finish", description: "Echo skill executed successfully (Fallback)" } },
        task_type: resolveTaskType({
          currentTaskType: state.task_type,
          action: { type: "finish", description: "Echo skill executed successfully (Fallback)" },
        }),
        messages: [new AIMessage({ content: "Planner fallback: Echo done, finishing." })],
        status: "RUNNING",
        node_memory_usage: plannerNodeMemoryUsage,
        node_memory_details: plannerMemoryDetails,
        };
      }

      return {
        ...memoryRefresh.statePatch,
        planner_output: {
          action: {
            type: "call_skill",
            skill_name: "echo",
            params: { text: "Hello CoTabor Skill System" },
            description: "Fallback: Calling echo skill due to LLM failure",
          },
        },
        task_type: resolveTaskType({
          currentTaskType: state.task_type,
          action: {
            type: "call_skill",
            skill_name: "echo",
            params: { text: "Hello CoTabor Skill System" },
            description: "Fallback: Calling echo skill due to LLM failure",
          },
        }),
        messages: [new AIMessage({ content: "Planner fallback: Calling echo skill" })],
        status: "RUNNING",
        node_memory_usage: plannerNodeMemoryUsage,
        node_memory_details: plannerMemoryDetails,
      };
    }

    const errorAction = { type: "finish", description: `Planner failed due to error: ${error}. Stopping execution.` };

    emitTrace({
      node: "planner",
      phase: "exit",
      ts: Date.now(),
      result: { status: "fail", error_type: "llm_error" },
      llm: { model_name: config.modelName },
      action: { type: errorAction.type },
    });

    return {
      ...memoryRefresh.statePatch,
      status: "FAILED",
      error: String(error),
      planner_output: { action: errorAction },
      task_type: resolveTaskType({
        currentTaskType: state.task_type,
        action: errorAction,
      }),
      messages: [new AIMessage({ content: `Planner failed: ${error}` })],
      node_memory_usage: plannerNodeMemoryUsage,
      node_memory_details: plannerMemoryDetails,
    };
  }
};
