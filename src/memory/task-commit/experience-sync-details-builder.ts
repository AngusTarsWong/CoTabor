import {
  CommittedMemoryDetail,
  ExperienceSyncDetails,
  RawTraceRecord,
  SyncQueueEntry,
  TaskRunRecord,
} from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";

function buildRawTraceDetails(rawTraces: RawTraceRecord[]): ExperienceSyncDetails["rawTraces"] {
  const syncedCount = rawTraces.filter((trace) => trace.syncStatus === "synced").length;
  const failedCount = rawTraces.filter((trace) => trace.syncStatus === "failed").length;
  const pendingCount = rawTraces.length - syncedCount - failedCount;
  const firstFailure = rawTraces.find((trace) => trace.syncStatus === "failed" && trace.syncError)?.syncError;

  return {
    status: failedCount > 0 ? "failed" : pendingCount > 0 ? "pending" : "synced",
    error: firstFailure,
    syncedCount,
    failedCount,
    pendingCount,
  };
}

function pickLatestQueueEntries(entries: SyncQueueEntry[]): Map<string, SyncQueueEntry> {
  const latest = new Map<string, SyncQueueEntry>();
  for (const entry of entries) {
    const key = `${entry.memoryLevel}:${entry.targetId}`;
    const existing = latest.get(key);
    const existingTs = existing?.lastAttemptAt || existing?.queuedAt || 0;
    const currentTs = entry.lastAttemptAt || entry.queuedAt || 0;
    if (!existing || currentTs >= existingTs) {
      latest.set(key, entry);
    }
  }
  return latest;
}

function buildNotionSyncDetails(
  taskRun: TaskRunRecord | undefined,
  rawTraceDetails: ExperienceSyncDetails["rawTraces"],
  committedMemories: CommittedMemoryDetail[] = [],
  queueEntries: SyncQueueEntry[] = [],
): ExperienceSyncDetails["notionSync"] {
  const issues = new Set<string>();
  const latestQueueEntries = pickLatestQueueEntries(queueEntries);

  if (taskRun?.cloudSyncStatus === "failed" && taskRun.cloudSyncError) {
    issues.add(taskRun.cloudSyncError);
  }
  if (rawTraceDetails.status === "failed" && rawTraceDetails.error) {
    issues.add(rawTraceDetails.error);
  }

  let hasPendingFormalMemory = false;
  let hasFailedFormalMemory = false;

  for (const memory of committedMemories) {
    const queue = latestQueueEntries.get(`${memory.level}:${memory.id}`);
    if (!queue) continue;
    if (queue.status === "failed" && queue.lastError) {
      hasFailedFormalMemory = true;
      issues.add(queue.lastError);
    } else {
      hasPendingFormalMemory = true;
      if (queue.lastError) issues.add(queue.lastError);
    }
  }

  if (hasFailedFormalMemory || taskRun?.cloudSyncStatus === "failed" || rawTraceDetails.status === "failed") {
    return {
      status: "failed",
      error: Array.from(issues)[0],
      issues: Array.from(issues),
    };
  }

  if (
    hasPendingFormalMemory ||
    taskRun?.cloudSyncStatus === "pending" ||
    rawTraceDetails.status === "pending"
  ) {
    return {
      status: "pending",
      issues: Array.from(issues),
    };
  }

  return {
    status: "synced",
    issues: Array.from(issues),
  };
}

export async function buildExperienceSyncDetails(
  taskRunId: string,
  committedMemories: CommittedMemoryDetail[] = [],
): Promise<ExperienceSyncDetails> {
  const [taskRun, rawTraces, queueEntries] = await Promise.all([
    memoryStore.getTaskRun(taskRunId),
    memoryStore.getRawTracesByTaskRun(taskRunId),
    memoryStore.getAllSyncQueueEntries(),
  ]);

  const taskRuns: ExperienceSyncDetails["taskRuns"] = taskRun?.cloudSyncStatus === "failed"
    ? { status: "failed", error: taskRun.cloudSyncError }
    : taskRun?.cloudSyncStatus === "synced"
      ? { status: "synced" }
      : { status: "pending" };

  const rawTracesDetails = buildRawTraceDetails(rawTraces);

  return {
    taskRuns,
    rawTraces: rawTracesDetails,
    notionSync: buildNotionSyncDetails(taskRun, rawTracesDetails, committedMemories, queueEntries),
  };
}
