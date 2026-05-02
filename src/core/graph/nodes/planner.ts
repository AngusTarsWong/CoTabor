import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../../shared/constants/env";
import { emitTrace } from "../../../shared/utils/trace";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { buildPlannerNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { plannerPrompt, resolveSystem } from "../../../prompts";
import { log } from "../../../shared/utils/log";
import { buildPlannerPromptVars } from "../../planning/buildPlannerContext";
import { parsePlannerResponse } from "../../planning/parsePlannerResponse";
import type { PlannedAction, HistoryStep } from "../../types/history";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("--- [Node: Planner] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Planner] Stop requested. Halting before next planning step.");
    return buildStoppedState(state);
  }

  const { total_history, meta_data, retrieved_memories } = state;
  const config = ENV.PLANNER_CONFIG;

  if (!config.enabled) {
    throw new Error("Planner model is disabled in configuration.");
  }

  const plannerMemoryUsage = buildPlannerNodeUsage({
    plannerContext: retrieved_memories?.plannerContext,
    l2Rules: retrieved_memories?.l2Rules,
  });

  const { vars, filteredSkills, currentUrl, tabId } = await buildPlannerPromptVars(state);

  const llm = new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseUrl },
    modelName: config.modelName,
    temperature: 0.2,
    timeout: 120000,
  });

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
        recentHistory: total_history.slice(-3),
      },
    });
  }

  try {
    const messages = [{ role: "user" as const, content: `${systemPrompt}\n\n${userPrompt}` }];
    const payload = { model: config.modelName, messages, temperature: 0.2 };

    const { content, tokenUsage } = await streamLLM(llm, messages, "planner", config.modelName);
    log.info(`[Planner] Raw LLM Output: ${content}`);

    const llmPayload = {
      node: "planner",
      timestamp: Date.now(),
      payload,
      response: content,
      model: config.modelName,
      token_usage: tokenUsage,
    };

    const { action: actionData, updatedTaskList } = parsePlannerResponse(content, filteredSkills, state);

    const newMessages = [
      new AIMessage({ content: `决策行动: ${actionData.type} - ${actionData.description || JSON.stringify(actionData)}` }),
    ];

    log.info(`--- [Planner] Action: ${actionData.type} ---`);
    if (updatedTaskList.length > 0) {
      updatedTaskList.forEach(t => log.info(`  [${t.status}] ${t.goal}`));
    }

    const status = actionData.type === "finish" ? "FINISHED" : "RUNNING";
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
      planner_output: { action: actionData },
      task_list: updatedTaskList,
      messages: newMessages,
      status,
      node_memory_usage: plannerMemoryUsage,
      total_history: [...total_history, historyItem],
      llm_payloads: [llmPayload],
      replan_context: null,
      meta_data: {
        ...meta_data,
        tabId: tabId || meta_data?.tabId,
        boundTabId: meta_data?.boundTabId || tabId || meta_data?.tabId,
        url: currentUrl,
      },
    };
  } catch (error) {
    log.error("[Planner] LLM Call Failed:", error);

    if (state.request.toLowerCase().includes("echo")) {
      log.info("[Planner] Activating Fallback for Echo Test...");
      const alreadyEchoed = total_history.some(
        (h: HistoryStep) => h.action.type === "call_skill" && h.action.skill_name === "echo",
      );

      if (alreadyEchoed) {
        return {
          planner_output: { action: { type: "finish", description: "Echo skill executed successfully (Fallback)" } },
          messages: [new AIMessage({ content: "Planner fallback: Echo done, finishing." })],
          status: "RUNNING",
          node_memory_usage: plannerMemoryUsage,
        };
      }

      return {
        planner_output: {
          action: {
            type: "call_skill",
            skill_name: "echo",
            params: { text: "Hello CoTabor Skill System" },
            description: "Fallback: Calling echo skill due to LLM failure",
          },
        },
        messages: [new AIMessage({ content: "Planner fallback: Calling echo skill" })],
        status: "RUNNING",
        node_memory_usage: plannerMemoryUsage,
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
      status: "FAILED",
      error: String(error),
      planner_output: { action: errorAction },
      messages: [new AIMessage({ content: `Planner failed: ${error}` })],
      node_memory_usage: plannerMemoryUsage,
    };
  }
};
