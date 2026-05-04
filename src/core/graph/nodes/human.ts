import { interrupt } from "@langchain/langgraph";
import { AgentState } from "../state";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { stabilizeAndCapturePage } from "../../execution/PageStabilizer";
import { CdpTools } from "../../../drivers/cdp/tools";
import { log } from "../../../shared/utils/log";

/**
 * Human-in-the-loop node.
 * Pauses graph execution when the agent requires explicit user approval.
 *
 * Trigger types decided by the planner:
 * - "confirmation": irreversible actions such as submit/send/delete
 * - "login": the user must complete login or verification manually
 * - "captcha": the user must solve a CAPTCHA or slider challenge
 * - "2fa": the user must complete two-factor authentication
 * - "stuck": agent is stuck after repeated failures, user can unblock manually
 */
export const humanNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("[Human]", "--- [Node: Human] Waiting for user input ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Human]", "Stop requested. Skipping human confirmation step.");
    return buildStoppedState(state);
  }

  const action = state.planner_output?.action;

  const interruptPayload = {
    type: (action?.human_type as "confirmation" | "login" | "captcha" | "2fa" | "stuck") || "confirmation",
    message: action?.human_message || "请确认 Agent 即将执行的操作",
    action_description: action?.description,
  };

  // interrupt() pauses the graph and forwards the payload to the UI.
  // On resume, humanResponse is supplied via Command({ resume: ... }).
  const humanResponse = interrupt(interruptPayload) as { confirmed: boolean };

  if (!humanResponse?.confirmed) {
    log.info("[Human]", "--- [Node: Human] User cancelled the action ---");
    const history = state.total_history;
    const lastItem = history[history.length - 1];
    return {
      status: "RUNNING",
      total_history: [
        ...history.slice(0, -1),
        { ...lastItem, result: { success: false, reason: "Cancelled by user", error: "Cancelled by user" } },
      ],
      meta_data: { ...state.meta_data, human_cancelled: true },
    };
  }

  // User completed their manual action (login, captcha, etc.).
  // Capture the current page state now so downstream nodes see the post-human screenshot,
  // not the stale one from before the interrupt.
  log.info("[Human]", "--- [Node: Human] User confirmed, capturing post-human page state ---");

  const tabId = state.meta_data?.boundTabId ?? state.meta_data?.tabId;
  let newScreenshot = state.screenshot;
  let newMetaData: Record<string, any> = {
    ...state.meta_data,
    human_cancelled: false,
    memory_refresh_reason: "post_human",
  };

  if (tabId) {
    try {
      const snapshot = await stabilizeAndCapturePage(tabId);
      newMetaData = { ...newMetaData, url: snapshot.url, page_content: snapshot.pageContent };
      log.info("[Human]", `Page stabilized after human action: ${snapshot.url}`);
    } catch (e: any) {
      log.warn("[Human]", `Failed to stabilize page after human action: ${e.message}`);
    }

    try {
      const cdpTools = new CdpTools(tabId);
      newScreenshot = await cdpTools.captureScreenshot(80);
      log.info("[Human]", "Captured post-human screenshot.");
    } catch (e: any) {
      log.warn("[Human]", `Failed to capture post-human screenshot: ${e.message}`);
    }
  }

  return {
    status: "RUNNING",
    screenshot: newScreenshot,
    meta_data: newMetaData,
  };
};
