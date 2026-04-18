import { useEffect, useState } from "react";
import {
  DEFAULT_INTEGRATION_STATUS,
  IntegrationStatus,
  loadIntegrationStatus,
} from "../../shared/storage/integration-status";

export function useIntegrationStatus() {
  const [status, setStatus] = useState<IntegrationStatus>(DEFAULT_INTEGRATION_STATUS);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        const next = await loadIntegrationStatus();
        if (!disposed) {
          setStatus(next);
        }
      } catch (error) {
        console.warn("[Sidepanel] Failed to load integration status:", error);
      }
    };

    refresh();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      const watchedKeys = [
        "storageBackend",
        "brainBaseConfig",
        "notionBackendConfig",
        "notionParentPageUrl",
        "notionSession",
        "llmConfig",
        "mcpServers",
        "lark_auth_session",
      ];
      if (watchedKeys.some((key) => key in changes)) {
        refresh();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      disposed = true;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return status;
}
