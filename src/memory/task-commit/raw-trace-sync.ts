import { NotionTableOperator } from "../../skills/bundled/notion-operator/api";
import { memoryStore } from "../store/indexeddb";
import { NotionBackendConfig } from "../../shared/types/operator";
import { RawTraceRecord } from "../../shared/types/memory";

async function getNotionRawTraceSyncContext(): Promise<{ operator: NotionTableOperator; config: NotionBackendConfig } | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;

  const stored = await chrome.storage.local.get([
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

function buildRawTraceFields(trace: RawTraceRecord, now: number): Record<string, any> {
  const refs = trace.memoryRefs || [];

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
    timestamp: trace.timestamp,
    syncedAt: now,
    updatedAt: now,
  };
}

export async function syncRawTracesToCloud(taskRunId: string): Promise<boolean> {
  const ctx = await getNotionRawTraceSyncContext();
  if (!ctx) return false;

  const { operator, config } = ctx;
  const traces = await memoryStore.getRawTracesByTaskRun(taskRunId);
  if (traces.length === 0) return true;

  const now = Date.now();
  for (const trace of traces) {
    await operator.updateRecordByCustomId(
      config.taskTableIds!.RawTraces!,
      trace.traceId,
      buildRawTraceFields(trace, now),
    );
  }

  if (config.taskTableIds?.SyncLog) {
    await operator.createRecord(config.taskTableIds.SyncLog, {
      id: `sync_raw_${taskRunId}_${now}`,
      taskRunId,
      level: "RAW_TRACE",
      status: "SUCCESS",
      message: `Raw traces synced. count=${traces.length}`,
      syncedAt: now,
      updatedAt: now,
    });
  }

  return true;
}
