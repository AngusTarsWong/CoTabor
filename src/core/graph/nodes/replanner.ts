import { AgentState } from "../state";
import { getAgentLangInstruction } from "../../../i18n/agent-lang";
import { ENV } from "../../../shared/constants/env";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { AIMessage } from "@langchain/core/messages";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { buildReplannerNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { buildMemoryRefreshContext } from "../../../memory/service/build-memory-refresh-context";
import { getMemoryRefreshResult } from "../../../memory/service/memory-refresh-service";
import { replannerPrompt, resolveSystem } from "../../../prompts";
import { log } from "../../../shared/utils/log";
import { resolveTaskType } from "../../planning/task-type";
import { createLlmClient } from "../../../shared/llm/provider";
import { normalizePlannedAction } from "../../planning/parsePlannerResponse";
import type { HistoryStep } from "../../types/history";

function summarizeHistoryStep(step: HistoryStep): string {
  const actionName = `${step.action?.type || "unknown"}${step.action?.skill_name ? `(${step.action.skill_name})` : ""}`;
  const resultText = step.result
    ? step.result.success
      ? "SUCCESS"
      : `FAILED: ${step.result.error || step.result.reason || "unknown"}`
    : "PENDING";
  const auditText = step.audit
    ? ` | audit=${step.audit.status}: ${step.audit.reason}`
    : "";
  const summaryText = step.step_summary ? ` | summary=${step.step_summary}` : "";
  return `Step ${step.step}: ${actionName} -> ${resultText}${auditText}${summaryText}`;
}

function buildLastActionEvidence(step: HistoryStep | undefined, lastObservation: Record<string, any> | null | undefined): string {
  if (!step) return "No previous action.";

  const observationText = lastObservation?.text
    ? String(lastObservation.text).replace(/\s+/g, " ").slice(0, 600)
    : "none";
  return [
    `Action: ${JSON.stringify(step.action || {})}`,
    `Execution result: ${JSON.stringify(step.result || null)}`,
    `Watchdog audit: ${step.audit ? `${step.audit.status}: ${step.audit.reason}` : "none"}`,
    `Step summary: ${step.step_summary || "none"}`,
    `Last observation: ${observationText}`,
  ].join("\n");
}

function hasUnresolvedAuditFailure(step: HistoryStep | undefined): boolean {
  return step?.audit?.status === "FAIL";
}

export function auditFailureBlocksFinish(step: HistoryStep | undefined): boolean {
  if (!hasUnresolvedAuditFailure(step)) return false;
  const text = `${step?.audit?.reason || ""}\n${step?.step_summary || ""}`.toLowerCase();
  return /未提取|无有效|未达到预期|未成功|no\s+data|no\s+result|not\s+extract|failed\s+to\s+extract/.test(text);
}

export function validateRecoveryFinish(action: any, state: { lastStep?: HistoryStep; request: string }): any {
  if (action?.type !== "finish") return action;

  if (!auditFailureBlocksFinish(state.lastStep)) return action;

  const intent = [
    "最近一次 Watchdog 审计仍失败，且没有有效结果证据，禁止直接结束任务。",
    `请基于当前页面继续完成原始目标：${state.request}`,
  ].join(" ");

  return {
    type: "ui_interact",
    intent,
    description: "最近一步没有提取到有效结果，继续恢复执行而不是 finish。",
  };
}

export const replannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("\n--- [Node: Replanner] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Replanner] Stop requested. Skipping replan step.");
    return buildStoppedState(state);
  }

  const refreshReason = state.status === "NEEDS_REPLAN" ? "post_cortex" : "retry";
  const memoryRefresh = await getMemoryRefreshResult(
    buildMemoryRefreshContext(state, {
      consumer: "replanner",
      reason: refreshReason,
    })
  );
  const effectiveState: AgentState = {
    ...state,
    retrieved_memories: memoryRefresh.statePatch.retrieved_memories,
    available_skills: memoryRefresh.statePatch.available_skills,
    node_memory_usage: memoryRefresh.statePatch.node_memory_usage,
    memory_refresh_state: memoryRefresh.statePatch.memory_refresh_state,
  };
  const { request, total_history, scratchpad, long_term_memory, meta_data, last_error_context, task_list, replan_count, retrieved_memories, screenshot, consecutive_failures, last_observation } = effectiveState;
  const currentReplanCount = (replan_count ?? 0) + 1;
  log.info(`[Replanner] Invocation #${currentReplanCount}`);
  const lastStep = total_history[total_history.length - 1];

  const historyText = total_history.length > 0
    ? total_history.slice(-10).map(summarizeHistoryStep).join('\n')
    : 'No history available';

  // Build Cortex scratchpad summary
  const cortexText = scratchpad.length > 0
    ? scratchpad.map((s: any, i: number) =>
        `Attempt ${i + 1}: ${s.action?.type || 'unknown'} at (${s.action?.x}, ${s.action?.y}) → ${s.result || 'no result'}`
      ).join('\n')
    : 'No Cortex attempts recorded';

  const pageContent = meta_data?.page_content || 'No page content available';
  const currentUrl = meta_data?.url || 'unknown';
  const lastActionEvidence = buildLastActionEvidence(lastStep, last_observation);
  const retrievedMemoryContext = retrieved_memories?.replannerContext
    ? `\nRetrieved memories:\n${retrieved_memories.replannerContext}\n`
    : "";
  const replannerMemoryUsage = buildReplannerNodeUsage({
    replannerContext: retrieved_memories?.replannerContext,
    l2Rules: retrieved_memories?.l2Rules,
  });

  const langInstruction = await getAgentLangInstruction();
  const promptVars = {
    langInstruction,
    request,
    currentUrl,
    historyText,
    cortexText,
    pageContent,
    retrievedMemoryContext,
    taskListStr: task_list && task_list.length > 0
      ? task_list.map(t => `- [${t.status}] ${t.goal}`).join('\n')
      : 'None',
    lastActionEvidence,
    lastErrorContext: last_error_context || 'none',
    consecutiveFailures: consecutive_failures || 0,
  };
  const systemPrompt = resolveSystem(replannerPrompt, promptVars);
  const userPrompt = replannerPrompt.user(promptVars);

  const config = ENV.PLANNER_CONFIG;
  let llmPayloadInput: Record<string, any> | null = null;

  let rootCause = 'The current UI path is blocked after multiple recovery attempts.';
  let recoveryAction: any = {
    type: 'call_skill',
    skill_name: 'browser_navigate',
    params: { url: currentUrl || 'about:blank' },
    description: 'Reload current page to reset state',
  };
  let newStrategy = 'Reload the current page and attempt the goal using a different approach.';
  let clearHistory = false;
  let parsed: any = {};
  let rawLlmResponse = "";
  let tokenUsage = { prompt: 0, completion: 0, total: 0 };

  try {
    const llm = await createLlmClient("planner", "main", { temperature: 0.1, maxTokens: 600, timeout: 30000 });

    const llmMessages = [["system", systemPrompt], ["human", userPrompt]];
    llmPayloadInput = {
      model: config.modelName,
      systemPrompt,
      userPrompt,
      messages: llmMessages,
      input: {
        request,
        currentUrl,
        historyText,
        cortexText,
        lastActionEvidence,
        lastErrorContext: last_error_context || 'none',
      },
    };
    const { content, tokenUsage: tu } = await streamLLM(llm, llmMessages, 'replanner', config.modelName, 'main', state.task_run_id);
    rawLlmResponse = content;
    tokenUsage = tu;
    log.info(`[Replanner] LLM output: ${content}`);

    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }
    parsed = JSON.parse(cleanContent);
    rootCause = parsed.root_cause || rootCause;
    recoveryAction = normalizePlannedAction(parsed.recovery_action || recoveryAction, effectiveState.available_skills || []);
    newStrategy = parsed.new_strategy || newStrategy;
    clearHistory = parsed.clear_history === true;
  } catch (e) {
    log.error('[Replanner] LLM call failed, using fallback recovery:', e);
  }

  recoveryAction = validateRecoveryFinish(recoveryAction, { lastStep, request });

  log.info(`[Replanner] Root cause: ${rootCause}`);
  log.info(`[Replanner] Recovery action: ${JSON.stringify(recoveryAction)}`);
  log.info(`[Replanner] Clear history: ${clearHistory}`);

  const replanContext = `[STRATEGIC REPLAN #${currentReplanCount}]\nRoot cause: ${rootCause}\nNew strategy: ${newStrategy}\nDo NOT repeat the previously failed approach.`;

  const step = total_history.length + 1;
  const recoveryHistoryItem = {
    step,
    action: recoveryAction,
    result: null,
  };

  return {
    ...memoryRefresh.statePatch,
    planner_output: { action: recoveryAction },
    task_type: resolveTaskType({
      currentTaskType: state.task_type,
      action: recoveryAction,
    }),
    total_history: [...total_history, recoveryHistoryItem],
    replan_context: replanContext,
    replan_count: currentReplanCount,
    task_list: parsed.task_list || task_list,
    scratchpad: [],
    watchdog_output: null,
    last_error_context: null,
    cortex_retry_count: 0,
    // Reset consecutive_failures when escalating to human so the counter starts fresh after resume.
    consecutive_failures: recoveryAction?.requires_human ? 0 : (consecutive_failures || 0),
    status: "RUNNING",
    ...(clearHistory ? { total_history: [recoveryHistoryItem], long_term_memory: { summary: '', notebook: long_term_memory?.notebook || {} } } : {}),
    messages: [new AIMessage(`[Replanner #${currentReplanCount}] 原因: ${rootCause} | 恢复行动: ${recoveryAction.description || recoveryAction.result || ''}`)],
    node_memory_usage: replannerMemoryUsage,
    llm_payloads: [{
      node: 'replanner',
      timestamp: Date.now(),
      payload: {
        ...(llmPayloadInput || { model: config.modelName }),
        parsedResponse: parsed,
      },
      response: rawLlmResponse || (typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)),
      model: config.modelName,
      token_usage: tokenUsage
    }],
    node_llm_payloads: [{
      node: 'replanner',
      timestamp: Date.now(),
      payload: {
        ...(llmPayloadInput || { model: config.modelName }),
        parsedResponse: parsed,
      },
      response: rawLlmResponse || (typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)),
      model: config.modelName,
      token_usage: tokenUsage
    }],
    debug_payloads: [
      {
        node: "replanner",
        title: `恢复规划 #${currentReplanCount}`,
        input: {
          request,
          currentUrl,
          historyText,
          cortexText,
          lastActionEvidence,
          lastErrorContext: last_error_context || "none",
        },
        output: {
          rootCause,
          recoveryAction,
          newStrategy,
          clearHistory,
        },
        media: screenshot
          ? [{ title: "重规划参考截图", mimeType: "image/jpeg", data: screenshot }]
          : [],
      },
    ],
  };
};
