import { MemoryCandidate, MemoryRefRecord, RawTraceRecord } from "../../shared/types/memory";

export function applyMemoryRefToRawTraces(
  rawTraces: RawTraceRecord[],
  candidate: MemoryCandidate,
  ref?: MemoryRefRecord,
): RawTraceRecord[] {
  if (!ref || !candidate.sourceTraceIds || candidate.sourceTraceIds.length === 0) {
    return rawTraces;
  }

  const traceIds = new Set(candidate.sourceTraceIds);
  return rawTraces.map((trace) => {
    if (!traceIds.has(trace.traceId)) {
      return trace;
    }

    const existingRefs = trace.memoryRefs || [];
    const alreadyExists = existingRefs.some((item) => item.id === ref.id && item.level === ref.level);
    if (alreadyExists) {
      return trace;
    }

    return {
      ...trace,
      memoryRefs: [...existingRefs, ref],
    };
  });
}
