import { NotionTableOperator } from "../../skills/bundled/notion-operator/api";
import { memoryStore } from "../store/indexeddb";
import { TaskRunRecord } from "../../shared/types/memory";
import { NotionBackendConfig } from "../../shared/types/operator";
import { syncRawTracesToCloud } from "./raw-trace-sync";

async function getNotionTaskSyncContext(): Promise<{ operator: NotionTableOperator; config: NotionBackendConfig } | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;

  const stored = await chrome.storage.local.get([
    "storageBackend",
    "notionBackendConfig",
    "notionApiKey",
  ]);

  if (stored.storageBackend !== "notion") return null;
  const config = stored.notionBackendConfig as NotionBackendConfig | undefined;
  const apiKey = stored.notionApiKey as string | undefined;
  if (!config?.taskTableIds?.TaskRuns || !config?.taskTableIds?.SyncLog || !apiKey) return null;

  return {
    operator: new NotionTableOperator(apiKey),
    config,
  };
}

export async function syncTaskRunToCloud(taskRun: TaskRunRecord): Promise<boolean> {
  const ctx = await getNotionTaskSyncContext();
  if (!ctx) return false;

  const { operator, config } = ctx;
  const now = Date.now();
  const taskRunFields = {
    id: taskRun.id,
    goal: taskRun.goal,
    status: taskRun.status,
    hostUrl: taskRun.hostUrl,
    hostTitle: taskRun.hostTitle,
    globalSummary: taskRun.globalSummary,
    traceCount: taskRun.traceCount,
    candidateCount: taskRun.candidateCount,
    committedL1: taskRun.committedL1,
    committedL2: taskRun.committedL2,
    committedL3: taskRun.committedL3,
    droppedCount: taskRun.droppedCount,
    localPersistStatus: taskRun.localPersistStatus,
    cloudSyncStatus: "synced",
    cloudSyncError: taskRun.cloudSyncError || "",
    startedAt: taskRun.startedAt,
    finishedAt: taskRun.finishedAt,
    syncedAt: now,
    updatedAt: now,
  };

  await operator.updateRecordByCustomId(config.taskTableIds!.TaskRuns!, taskRun.id, taskRunFields);

  await operator.createRecord(config.taskTableIds!.SyncLog!, {
    id: `sync_${taskRun.id}_${now}`,
    taskRunId: taskRun.id,
    level: "TASK_RUN",
    status: "SUCCESS",
    message: `TaskRun synced. experience=${taskRun.experienceStatus}, traces=${taskRun.traceCount}, candidates=${taskRun.candidateCount}, L1=${taskRun.committedL1}, L2=${taskRun.committedL2}, L3=${taskRun.committedL3}, DROP=${taskRun.droppedCount}`,
    syncedAt: now,
    updatedAt: now,
  });

  return true;
}

export async function syncPendingTaskRuns(): Promise<void> {
  const pending = await memoryStore.getUnsyncedTaskRuns();
  for (const taskRun of pending) {
    try {
      const synced = await syncTaskRunToCloud(taskRun);
      const rawTraceSynced = synced ? await syncRawTracesToCloud(taskRun.id) : false;
      if (synced && rawTraceSynced) {
        await memoryStore.putTaskRun({
          ...taskRun,
          cloudSyncStatus: "synced",
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (error: any) {
      await memoryStore.putTaskRun({
        ...taskRun,
        cloudSyncStatus: "failed",
        cloudSyncError: error?.message || String(error),
        updatedAt: Date.now(),
      });
    }
  }
}
