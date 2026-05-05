import { useEffect, useState } from "react";
import {
  DEFAULT_INTEGRATION_STATUS,
  IntegrationStatus,
  loadIntegrationStatus,
} from "../../shared/storage/integration-status";
import { skillRegistry } from "../../skills/registry";

export function useIntegrationStatus() {
  const [status, setStatus] = useState<IntegrationStatus>(DEFAULT_INTEGRATION_STATUS);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        await skillRegistry.loadAll();
        const next = await loadIntegrationStatus();
        if (!disposed) {
          setStatus({
            ...next,
            skills: {
              loadedCount: skillRegistry.getAllSkills().length,
            },
          });
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
        "notionBackendConfig",
        "notionParentPageUrl",
        "notionSession",
        "llmConfig",
        "mcpServers",
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
