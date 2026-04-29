import { AgentState } from "../state";
import { isAgentStopRequested } from "../../../lib/claw/stop-signal-registry";

export const shouldStopAtNodeEntry = (state: AgentState): boolean => {
  const threadId = state.meta_data?.agent_thread_id;
  return Boolean(
    state.stop_requested ||
    state.status === "STOPPING" ||
    state.status === "STOPPED" ||
    isAgentStopRequested(threadId)
  );
};

export const buildStoppedState = (state: AgentState): Partial<AgentState> => {
  return {
    status: "STOPPED",
    stop_requested: true,
    stop_reason: state.stop_reason || "Stopped by user",
    stop_requested_at: state.stop_requested_at || Date.now(),
    error: null,
  };
};
