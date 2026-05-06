import { AgentState } from "../state";
import { log } from "../../../shared/utils/log";
import { HumanMessage } from "@langchain/core/messages";
import { skillRegistry } from "../../../skills/registry";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { buildExecutorNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { buildExecutorNodeMemoryDetails } from "../../../memory/retrieval/memory-detail-builder";
import { buildMemoryRefreshContext } from "../../../memory/service/build-memory-refresh-context";
import { getMemoryRefreshResult } from "../../../memory/service/memory-refresh-service";
import { runHybridUIExecution } from "../../execution/HybridUIExecutor";
import { stabilizeAndCapturePage, isNavigationError } from "../../execution/PageStabilizer";
import { captureOpenedTabs } from "../../execution/TabStateCapture";
import type { HistoryStep } from "../../types/history";
import { CdpTools } from "../../../drivers/cdp/tools";

const toTraceHistory = (history: HistoryStep[]): Array<Record<string, unknown>> =>
  history.map((step) => ({
    step: step.step,
    action: step.action as unknown as Record<string, unknown>,
    result: (step.result ?? null) as unknown as Record<string, unknown> | null,
    step_summary: step.step_summary,
    meta: step.meta,
  }));

const resolveTargetTabId = async (metaData?: Record<string, any>): Promise<number | undefined> => {
  const boundTabId = metaData?.boundTabId;
  if (boundTabId) return boundTabId;
  const fallbackTabId = metaData?.tabId;
  if (fallbackTabId) return fallbackTabId;
  
  // Do not infer the active tab at runtime; callers must pass an explicit tab binding.
  log.warn("[Executor] Missing boundTabId/tabId in context. Refusing to infer the active tab automatically.");
  return undefined;
};

export const isRestrictedExecutionUrl = (url?: string): boolean => {
  if (!url) return false;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    url.startsWith("devtools://")
  );
};

export const canRunOnRestrictedUrl = (action: any): boolean => {
  if (action?.type !== "call_skill") return false;
  return [
    "browser_navigate",
    "browser_new_tab",
    "browser_switch_tab",
    "browser_close_tab",
  ].includes(action.skill_name);
};

const getTabUrlSafe = async (tabId: number): Promise<string> => {
  try {
    // Try chrome.tabs API first (browser extension environment)
    if (typeof chrome !== "undefined" && chrome.tabs?.get) {
      const tab = await chrome.tabs.get(tabId);
      return tab?.url || "";
    }
    // Fallback: use CDP to get current URL (Node/Puppeteer environment)
    const { cdpClient } = await import("../../../drivers/cdp/index");
    const result = await cdpClient.send(tabId, 'Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true
    });
    return result?.result?.value || "";
  } catch {
    return "";
  }
};

export const executorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("[Executor]", "\n--- [Node: Executor] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Executor]", "Stop requested. Skipping execution step.");
    return buildStoppedState(state);
  }

  const memoryRefresh = await getMemoryRefreshResult(
    buildMemoryRefreshContext(state, {
      consumer: "executor",
      reason: "execution",
    })
  );
  const effectiveState: AgentState = {
    ...state,
    retrieved_memories: memoryRefresh.statePatch.retrieved_memories,
    available_skills: memoryRefresh.statePatch.available_skills,
    node_memory_usage: memoryRefresh.statePatch.node_memory_usage,
    memory_refresh_state: memoryRefresh.statePatch.memory_refresh_state,
  };
  const { planner_output, meta_data, total_history, retrieved_memories } = effectiveState;
  const tabId = await resolveTargetTabId(meta_data);

  if (!planner_output?.action) {
    log.warn("[Executor]", "No action provided by planner.");
    return { status: "FAILED", error: "No valid action provided by planner" };
  }

  const action = planner_output.action;
  const effectiveAction = typeof action?.type === "string" && action.type.startsWith("browser_")
    ? { type: "call_skill", skill_name: action.type, params: action.params || {}, description: action.description || `Execute ${action.type}` }
    : action;

  log.info("[Executor]", `Executing action: ${effectiveAction.type}${effectiveAction.skill_name ? `(${effectiveAction.skill_name})` : ""}`);

  const fallbackExecutorL1Hints = retrieved_memories?.executorL1Hints || [];
  const retrievedL1Items = retrieved_memories?.l1Items || [];
  const executorMemoryUsage = buildExecutorNodeUsage({
    l1Items: retrievedL1Items,
    intent: effectiveAction?.intent || effectiveAction?.description || effectiveAction?.skill_name || effectiveAction?.type,
    currentUrl: meta_data?.url,
    fallbackHints: fallbackExecutorL1Hints,
    limit: 3,
  });
  const executorNodeMemoryUsage = memoryRefresh.statePatch.node_memory_usage?.refresh
    ? {
        ...executorMemoryUsage,
        refresh: memoryRefresh.statePatch.node_memory_usage.refresh,
      }
    : executorMemoryUsage;
  const executorMemoryDetails = buildExecutorNodeMemoryDetails({
    l1Items: retrievedL1Items,
    selectedHints: executorNodeMemoryUsage.l1,
    refresh: executorNodeMemoryUsage.refresh,
  });

  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "executor", phase: "enter", ts: Date.now(),
      step_id: total_history?.length ?? 0,
      action: { type: effectiveAction.type, skill_name: (effectiveAction as any).skill_name, params_digest: (effectiveAction as any).params || {} },
      state: { before: { url: meta_data?.url, page_content_len: (meta_data?.page_content || "").length }, recentHistory: Array.isArray(total_history) ? toTraceHistory(total_history.slice(-3)) : [] },
    });
  }

  let executionResult: any = { success: true };
  let newMetaData: any = {};
  let lastObservation: Record<string, any> | null = null;
  let llmPayloads: any[] = [];
  let debugPayloads: any[] = [];
  let requiresPageExecution = false;

  if (tabId || effectiveAction.type === "inspect_skill") {
    try {
      if (tabId) {
        try {
          newMetaData = {
            ...state.meta_data,
            memory_refresh_reason: undefined,
            url: await getTabUrlSafe(tabId),
          };
        } catch {
          newMetaData = { ...state.meta_data, memory_refresh_reason: undefined };
        }
      } else {
        newMetaData = { ...state.meta_data, memory_refresh_reason: undefined };
      }
      delete newMetaData.page_content;

      const isBrowserSkill = effectiveAction.type === "call_skill" && typeof effectiveAction.skill_name === "string" && effectiveAction.skill_name.startsWith("browser_");
      requiresPageExecution = isBrowserSkill || effectiveAction.type === "read" || effectiveAction.type === "ui_interact";

      if (tabId && requiresPageExecution) {
        try {
          const tabUrl = await getTabUrlSafe(tabId);
          if (isRestrictedExecutionUrl(tabUrl) && !canRunOnRestrictedUrl(effectiveAction)) {
            const guardError = `Blocked execution on restricted URL: ${tabUrl}`;
            log.warn("[Executor]", guardError);
            executionResult = { success: false, error: guardError };
            newMetaData = { ...newMetaData, url: tabUrl, page_content: `[Guard] ${guardError}` };
          }
        } catch (e: any) {
          const guardError = `Failed to validate target tab URL: ${e?.message || String(e)}`;
          log.warn("[Executor]", guardError);
          executionResult = { success: false, error: guardError };
          newMetaData = { ...newMetaData, page_content: `[Guard] ${guardError}` };
        }
      }

      if (executionResult.success) {
        switch (effectiveAction.type) {
          case "ui_interact":
            log.info("[Executor]", `Tactical Sub-Agent: Grounding mission -> ${effectiveAction.intent}`);
            try {
              const result = await runHybridUIExecution(effectiveAction.intent, tabId!, meta_data?.url, retrievedL1Items, fallbackExecutorL1Hints);
              executionResult = result;
              llmPayloads = Array.isArray(result.llmPayloads) ? result.llmPayloads : [];
              debugPayloads = Array.isArray(result.debugPayloads) ? result.debugPayloads : [];
            } catch (err: any) {
              if (isNavigationError(err)) {
                // Navigation triggered by the action is a success signal, not a failure.
                // stabilizeAndCapturePage will handle waiting for the new page below.
                log.info("[Executor]", "ui_interact caused page navigation — treating as success.");
                executionResult = { success: true };
              } else {
                log.error("[Executor]", `Tactical execution failed: ${err.message}`);
                executionResult = { success: false, error: err.message };
              }
            }
            break;

          case "memorize": {
            const memorizeKey = effectiveAction.key || effectiveAction.params?.key || "note";
            const memorizeValue = effectiveAction.value || effectiveAction.params?.value || effectiveAction.text;
            log.info("[Executor]", `Memorizing: ${memorizeKey} = ${memorizeValue}`);
            const currentLtm = effectiveState.long_term_memory || { summary: "", notebook: {} };
            return {
              ...memoryRefresh.statePatch,
              total_history: [...(total_history || []), { step: (total_history || []).length + 1, action: effectiveAction, result: { success: true, message: `Memorized ${memorizeKey}` }, meta: newMetaData }],
              meta_data: newMetaData,
              long_term_memory: { ...currentLtm, notebook: { ...currentLtm.notebook, [memorizeKey]: memorizeValue } },
              node_memory_usage: executorNodeMemoryUsage,
              node_memory_details: executorMemoryDetails,
              debug_payloads: [
                {
                  node: "executor",
                  title: "记忆写入动作",
                  input: {
                    action: effectiveAction,
                    key: memorizeKey,
                    value: memorizeValue,
                  },
                  output: {
                    success: true,
                    message: `Memorized ${memorizeKey}`,
                  },
                },
              ],
            };
          }

          case "call_skill":
            log.info("[Executor]", `Calling skill: ${effectiveAction.skill_name}`);
            try {
              const context = tabId ? { tabId, swarmMode: meta_data?.swarmMode ?? false } : undefined;
              const skillResult = await skillRegistry.execute(effectiveAction.skill_name, effectiveAction.params || {}, context);
              executionResult = { success: true, skill_result: skillResult };
              lastObservation = {
                kind: "skill_result", skill_name: effectiveAction.skill_name, params: effectiveAction.params || {},
                text: typeof skillResult === "string" ? skillResult : JSON.stringify(skillResult, null, 2),
              };
              // When a tab operation succeeds, update boundTabId so subsequent steps
              // target the correct tab instead of the original one.
              if (
                effectiveAction.skill_name === "browser_new_tab" ||
                effectiveAction.skill_name === "browser_switch_tab"
              ) {
                const newTabId = (skillResult as any)?.tabId ?? effectiveAction.params?.tabId;
                if (newTabId) {
                  newMetaData = { ...newMetaData, boundTabId: newTabId, tabId: newTabId };
                  log.info("[Executor]", `Tab switched to ${newTabId}, updating boundTabId.`);
                }
              }
            } catch (err: any) {
              log.error("[Executor]", `Skill execution failed: ${err.message}`);
              const failedTabUrl = tabId ? await getTabUrlSafe(tabId) : "";
              executionResult = { success: false, error: err.message };
              lastObservation = { kind: "skill_error", skill_name: effectiveAction.skill_name, params: effectiveAction.params || {}, text: err.message };
              newMetaData = { ...newMetaData, ...(failedTabUrl ? { url: failedTabUrl } : {}), page_content: `[Skill Error: ${effectiveAction.skill_name}] ${err.message}${failedTabUrl ? `\n[URL] ${failedTabUrl}` : ""}` };
            }
            break;

          case "inspect_skill":
            log.info("[Executor]", `Inspecting skill manual: ${effectiveAction.skill_name}`);
            try {
              const manual = await skillRegistry.getManual(effectiveAction.skill_name);
              executionResult = { success: true, manual_content: manual };
              newMetaData = { page_content: `[Skill Manual: ${effectiveAction.skill_name}]\n${manual}` };
            } catch (err: any) {
              log.error("[Executor]", `Skill inspection failed: ${err.message}`);
              executionResult = { success: false, error: err.message };
            }
            break;

          case "finish":
          case "read":
            break;

          default:
            log.warn("[Executor]", `Unknown action type: ${effectiveAction.type}`);
            executionResult = { success: false, error: `Unknown action type: ${effectiveAction.type}` };
        }
      }

      if (executionResult.success && !requiresPageExecution) {
        newMetaData = { ...newMetaData, page_content: "" };
      }

      if (tabId && executionResult.success && requiresPageExecution && effectiveAction.type !== "memorize" && effectiveAction.type !== "inspect_skill") {
        try {
          const snapshot = await stabilizeAndCapturePage(tabId);
          newMetaData = { ...newMetaData, url: snapshot.url, tabId, boundTabId: tabId, page_content: snapshot.pageContent };
          if (effectiveAction.type === "read") {
            executionResult = { success: true, text_content: snapshot.pageContent };
          }
        } catch (err) {
          log.warn("[Executor]", `Failed to fetch page content: ${err}`);
          if (!newMetaData.page_content) {
            newMetaData = { ...newMetaData, page_content: `[Error] Failed to fetch page content: ${err}` };
          }
        }
      }
    } catch (e: any) {
      log.error("[Executor]", `Action execution failed: ${e.message}`);
      executionResult = { success: false, error: e.message };
    }
  } else {
    // Mock execution for Node.js test environment (no real browser tab)
    log.info("[Executor]", "Mock execution (No tabId provided)");
    newMetaData = { ...state.meta_data, memory_refresh_reason: undefined };
    if (action.type === "call_skill" && action.skill_name === "browser_navigate") {
      executionResult = { success: true, skill_result: { status: "success" } };
      newMetaData = {
        ...newMetaData,
        page_content: `Interactive Elements:\n[1] <a> AI Breakthrough: New model solves math problems\n[2] <a> SpaceX lands Starship on Moon\n[3] <a> Global markets rally`,
      };
    } else if (action.type === "call_skill" && action.skill_name === "browser_click_index") {
      executionResult = { success: true, skill_result: { status: "success" } };
      newMetaData = {
        ...newMetaData,
        page_content: "[Article Content]\nTitle: AI Breakthrough: New model solves math problems with 99% accuracy.",
      };
    } else if (action.type === "memorize") {
      executionResult = { success: true, message: `Memorized ${action.key || action.params?.key}` };
    } else if (action.type === "call_skill" || action.type === "finish") {
      executionResult = { success: true, skill_result: { status: "success" } };
    }
  }

  // Post-execution screenshot (placeholder — swap in real capture when ready)
  let newScreenshot = state.screenshot;
  if (tabId && (ENV.MEDIA_CAPTURE_ON_FAIL ? !executionResult.success : true)) {
    try {
      const cdpTools = new CdpTools(tabId);
      newScreenshot = await cdpTools.captureScreenshot(80);
      log.info("[Executor]", "Captured new screenshot.");
    } catch (e: any) {
      if (isNavigationError(e)) {
        log.info("[Executor]", "Screenshot skipped — page navigated, new page not yet ready.");
      } else {
        log.error("[Executor]", `Failed to capture screenshot: ${e.message}`);
      }
    }
  }

  debugPayloads = [
    ...debugPayloads,
    {
      node: "executor",
      title: "执行节点输入输出",
      input: {
        action: effectiveAction,
        boundTabId: tabId || null,
        currentUrl: meta_data?.url || "",
        requiresPageExecution,
      },
      output: {
        executionResult,
        latestUrl: newMetaData?.url || "",
      },
      media: newScreenshot
        ? [{ title: "执行后页面截图", mimeType: "image/jpeg", data: newScreenshot }]
        : [],
    },
  ];

  // Update last history entry with execution result (screenshot lives in debug_payloads only)
  let updatedHistory = total_history;
  if (total_history && total_history.length > 0) {
    updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      result: executionResult,
      meta: newMetaData,
    };
  }

  log.info("[Executor]", "--- Execution Completed ---\n");

  const opened_tabs = await captureOpenedTabs();
  // Use the potentially-updated boundTabId (set above after tab switch) as the new active tab.
  const resolvedActiveTabId = newMetaData.boundTabId ?? state.meta_data?.tab_id ?? state.active_tab_id;

  const returnPayload: Partial<AgentState> = {
    ...memoryRefresh.statePatch,
    total_history: updatedHistory,
    screenshot: newScreenshot,
    messages: [new HumanMessage({ content: `Execution Step ${total_history?.length ?? 1} Result: ${executionResult.success ? "Success" : "Failed"}` })],
    active_tab_id: resolvedActiveTabId,
    opened_tabs: opened_tabs.length > 0 ? opened_tabs : state.opened_tabs,
    node_memory_usage: executorNodeMemoryUsage,
    node_memory_details: executorMemoryDetails,
    status: action.type === "finish" ? "FINISHED" : executionResult.success ? state.status : "RUNNING",
    error: executionResult.success ? null : (executionResult.error || state.error || "Executor step failed"),
    last_observation: lastObservation,
    meta_data: { ...newMetaData, tabId: tabId || newMetaData?.tabId || meta_data?.tabId },
    llm_payloads: llmPayloads,
    node_llm_payloads: llmPayloads,
    debug_payloads: debugPayloads,
  };

  const parsedKey = action.key || action.params?.key;
  const parsedValue = action.value || action.params?.value;
  if (action.type === "memorize" && parsedKey) {
    returnPayload.long_term_memory = {
      summary: effectiveState.long_term_memory?.summary || "",
      notebook: { ...(effectiveState.long_term_memory?.notebook || {}), [parsedKey]: parsedValue },
    };
  }

  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "executor", phase: "exit", ts: Date.now(),
      step_id: total_history?.length ?? 0,
      action: { type: action.type, skill_name: (action as any).skill_name, params_digest: (action as any).params || {} },
      result: { status: executionResult.success ? "success" : "fail", error_type: executionResult.error ? "runtime_error" : undefined },
      state: { after: { url: returnPayload.meta_data?.url, page_content_len: (returnPayload.meta_data?.page_content || "").length } },
      media: { dom_text_digest: (returnPayload.meta_data?.page_content || "").slice(0, 400), screenshot_ref: newScreenshot ? "<base64_hidden_for_log>" : undefined },
    });
  }

  return returnPayload;
};
