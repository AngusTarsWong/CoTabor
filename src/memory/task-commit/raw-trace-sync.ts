import { NotionTableOperator } from "../../skills/bundled/notion-operator/api";
import { memoryStore } from "../store/indexeddb";
import { NotionBackendConfig } from "../../shared/types/operator";
import { RawTraceRecord } from "../../shared/types/memory";
import { storageAdapter } from "../../runner/storage-adapter";

async function getNotionRawTraceSyncContext(): Promise<{ operator: NotionTableOperator; config: NotionBackendConfig } | null> {
  const stored = await storageAdapter.get([
    "storageBackend",
    "notionBackendConfig",
    "notionApiKey",
  ]);

  if (stored.storageBackend !== "notion") return null;
  const config = stored.notionBackendConfig as NotionBackendConfig | undefined;
  const apiKey = stored.notionApiKey as string | undefined;
  if (!config?.taskTableIds?.RawTraces || !apiKey) return null;

  return {
    operator: new NotionTableOperator(apiKey),
    config,
  };
}

function buildRawTraceFields(trace: RawTraceRecord, now: number, syncStatusOverride?: RawTraceRecord["syncStatus"], syncErrorOverride?: string): Record<string, any> {
  const refs = trace.memoryRefs || [];
  const syncStatus = syncStatusOverride ?? trace.syncStatus ?? "pending";
  const syncError = syncErrorOverride ?? trace.syncError ?? "";

  return {
    id: trace.traceId,
    taskRunId: trace.taskRunId,
    stepIndex: trace.stepIndex,
    nodeName: trace.nodeName || "",
    actionType: trace.actionType || "",
    skillName: trace.skillName || "",
    success: trace.success === undefined ? "" : String(trace.success),
    url: trace.url || "",
    domain: trace.domain || "",
    path: trace.path || "",
    pageTitle: trace.pageTitle || "",
    stepSummary: trace.stepSummary || "",
    errorMessage: trace.errorMessage || "",
    memoryLevels: refs.map((ref) => ref.level).join(", "),
    memoryIds: refs.map((ref) => ref.id).join(", "),
    memoryTitles: refs.map((ref) => ref.title).join("; "),
    syncStatus,
    syncError,
    syncRetryCount: trace.syncRetryCount || 0,
    lastSyncAttemptAt: trace.lastSyncAttemptAt || now,
    timestamp: trace.timestamp,
    syncedAt: syncStatus === "synced" ? (trace.syncedAt || now) : undefined,
    updatedAt: trace.updatedAt || now,
  };
}

export async function syncRawTracesToCloud(taskRunId: string): Promise<boolean> {
  const ctx = await getNotionRawTraceSyncContext();
  if (!ctx) return false;

  const { operator, config } = ctx;
  const now = Date.now();
  const traces = (await memoryStore.getRawTracesByTaskRun(taskRunId)).map((trace) => ({
    ...trace,
    lastSyncAttemptAt: now,
    updatedAt: now,
  }));
  if (traces.length === 0) return true;

  try {
    for (const trace of traces) {
      await operator.updateRecordByCustomId(
        config.taskTableIds!.RawTraces!,
        trace.traceId,
        buildRawTraceFields(trace, now, "synced", ""),
      );
    }
    await memoryStore.putRawTraces(
      traces.map((trace) => ({
        ...trace,
        syncStatus: "synced",
        syncError: "",
        syncedAt: now,
        updatedAt: now,
      })),
    );
    return true;
  } catch (error: any) {
    const message = error?.message || String(error);
    await memoryStore.putRawTraces(
      traces.map((trace) => ({
        ...trace,
        syncStatus: "failed",
        syncError: message,
        syncRetryCount: (trace.syncRetryCount || 0) + 1,
        updatedAt: now,
      })),
    );
    throw error;
  }
}
