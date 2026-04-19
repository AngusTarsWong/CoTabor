import { RawTraceRecord } from "../../shared/types/memory";

export function buildRawTraces(taskRunId: string, totalHistory: any[] = []): RawTraceRecord[] {
  return totalHistory.map((item: any, index: number) => {
    const url = item?.meta?.url || "";
    let domain = "";
    let path = "";
    try {
      if (url) {
        const parsed = new URL(url);
        domain = parsed.hostname;
        path = parsed.pathname;
      }
    } catch {
      // ignore invalid URL
    }

    return {
      traceId: `trace_${taskRunId}_${index + 1}`,
      taskRunId,
      timestamp: Number(item?.ts || item?.meta?.timestamp || Date.now()),
      stepIndex: Number(item?.step || index + 1),
      nodeName: item?.node,
      actionType: item?.action?.type,
      skillName: item?.action?.skill_name,
      success: item?.result?.success,
      url,
      domain,
      path,
      pageTitle: item?.meta?.title,
      stepSummary: item?.step_summary || item?.result?.message || item?.result?.error,
      errorMessage: item?.result?.error,
      syncStatus: "pending",
      syncRetryCount: 0,
      updatedAt: Date.now(),
      raw: item,
    };
  });
}
