import { useCallback, useEffect, useRef } from "react";
import { createSyncBackend } from "../../memory/sync/backend-factory";
import { SyncWorker } from "../../memory/sync/sync-worker";

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
    if (syncingRef.current || !workerRef.current) return;

    syncingRef.current = true;
    try {
      await workerRef.current.pushQueueToCloud();
    } catch (error) {
      console.warn("[MemorySync] Failed to push local queue:", error);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
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
