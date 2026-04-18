import { AgentState } from "../state";

export const shouldStopAtNodeEntry = (state: AgentState): boolean => {
  return Boolean(
    state.stop_requested ||
    state.status === "STOPPING" ||
    state.status === "STOPPED"
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
