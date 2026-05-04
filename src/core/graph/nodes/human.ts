import { interrupt } from "@langchain/langgraph";
import { AgentState } from "../state";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

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
  console.log("--- [Node: Human] Waiting for user input ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Human] Stop requested. Skipping human confirmation step.");
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
    // Mark cancellation in history and hand control back to the planner.
    console.log("--- [Node: Human] User cancelled the action ---");
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

  // User approved the action, continue to the executor.
  console.log("--- [Node: Human] User confirmed, proceeding to executor ---");
  return {
    status: "RUNNING",
    meta_data: { ...state.meta_data, human_cancelled: false },
  };
};
