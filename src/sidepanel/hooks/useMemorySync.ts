import { useCallback, useEffect, useRef } from "react";
import { createSyncBackend } from "../../memory/sync/backend-factory";
import { SyncWorker } from "../../memory/sync/sync-worker";
import { syncPendingTaskRuns } from "../../memory/task-commit/task-run-sync";
import { experienceJobScheduler } from "../../memory/experience-job/scheduler";
import { l3Bm25Index } from "../../memory/retrieval/l3-bm25-index";

const SYNC_INTERVAL_MS = 15000;

export function useMemorySync() {
  const workerRef = useRef<SyncWorker | null>(null);
  const syncingRef = useRef(false);

  const refreshBackend = useCallback(async () => {
    try {
      workerRef.current = await createSyncBackend();
    } catch (error) {
      console.warn("[MemorySync] Failed to create sync backend:", error);
      workerRef.current = null;
    }
  }, []);

  const pushPendingQueue = useCallback(async () => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    try {
      await experienceJobScheduler.schedulePendingRuns();
      if (workerRef.current) {
        await workerRef.current.pushQueueToCloud();
        await syncPendingTaskRuns();
      }
    } catch (error) {
      console.warn("[MemorySync] Failed to push local queue:", error);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    l3Bm25Index.warmup().catch((error) => {
      console.warn("[MemorySync] Failed to warm up L3 BM25 index:", error);
    });

    refreshBackend().then(pushPendingQueue);

    const intervalId = window.setInterval(() => {
      pushPendingQueue();
    }, SYNC_INTERVAL_MS);

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;

      const watchedKeys = [
        "storageBackend",
        "brainBaseConfig",
        "notionBackendConfig",
        "notionApiKey",
        "notionParentPageUrl",
        "larkAppId",
        "larkAppSecret",
      ];

      if (watchedKeys.some((key) => key in changes)) {
        refreshBackend().then(pushPendingQueue);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      window.clearInterval(intervalId);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [pushPendingQueue, refreshBackend]);

  return {
    triggerMemorySync: pushPendingQueue,
  };
}
