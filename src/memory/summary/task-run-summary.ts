export function selectTaskRunSummary(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

export function extractTaskRunSummaryFromFinalState(finalState: any, fallback?: string): string {
  return selectTaskRunSummary(
    fallback,
    finalState?.planner_output?.action?.result,
    finalState?.planner_output?.action?.summary,
    finalState?.planner_output?.action?.description,
    finalState?.output,
    finalState?.summary,
    finalState?.data,
  );
}

export function resolveTaskRunGlobalSummary(input: {
  existingSummary?: string;
  generatedSummary?: string;
}): string {
  return selectTaskRunSummary(input.generatedSummary, input.existingSummary);
}
