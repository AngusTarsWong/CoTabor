export const shouldFinalizeStopAfterChunk = (state: {
  stop_requested?: boolean | null;
  status?: string | null;
} | null | undefined): boolean => {
  if (!state) return false;
  return Boolean(state.stop_requested || state.status === "STOPPING" || state.status === "STOPPED");
};

export const finalizeStoppedState = <T extends {
  status?: string | null;
  stop_requested?: boolean | null;
  stop_reason?: string | null;
  stop_requested_at?: number | null;
  error?: string | null;
}>(state: T): T => {
  return {
    ...state,
    status: "STOPPED",
    stop_requested: true,
    stop_reason: state.stop_reason || "Stopped by user",
    stop_requested_at: state.stop_requested_at || Date.now(),
    error: null,
  };
};
