const requestedStops = new Set<string>();

export const requestAgentStop = (threadId: string): void => {
  requestedStops.add(threadId);
};

export const clearAgentStopRequest = (threadId: string): void => {
  requestedStops.delete(threadId);
};

export const isAgentStopRequested = (threadId: string | null | undefined): boolean => {
  if (!threadId) return false;
  return requestedStops.has(threadId);
};
