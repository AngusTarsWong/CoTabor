import { SyncWorker } from "./sync-worker";
import { NotionTableOperator } from "../../skills/bundled/notion-operator/api";
import { initializeNotionBrainBase, extractNotionPageId } from "../../skills/bundled/notion-operator/init";
import { NotionBackendConfig, SyncBackendType } from "../../shared/types/operator";
import { storageAdapter } from "../../runner/storage-adapter";

function createWorker(
  backendType: SyncBackendType,
  operator: NotionTableOperator,
  tableIds: { L1: string; L2: string; L3: string },
): SyncWorker {
  console.log("[BackendFactory] Using Notion backend.");
  return new SyncWorker(operator, { backendType, tableIds });
}

/**
 * Read the active backend type and its config from the storage adapter
 * (chrome.storage.local in extension, process.env in Node.js scripts),
 * construct the appropriate TableOperator, and return a ready-to-use SyncWorker.
 *
 * Returns null if no backend has been configured yet.
 */
export async function createSyncBackend(): Promise<SyncWorker | null> {
  const stored = await storageAdapter.get([
    "storageBackend",
    "notionBackendConfig",
    "notionApiKey",
    "notionParentPageUrl",
  ]);

  if (stored.storageBackend && stored.storageBackend !== "notion") {
    console.warn("[BackendFactory] Unsupported storageBackend value:", stored.storageBackend);
    return null;
  }

  // ── Notion ────────────────────────────────────────────────────────────────
  let cfg = stored.notionBackendConfig as NotionBackendConfig | undefined;
  const apiKey: string = stored.notionApiKey ?? "";
  const parentPageUrl: string = stored.notionParentPageUrl ?? "";

  if (!cfg && apiKey && parentPageUrl) {
    console.log("[BackendFactory] Notion config missing — auto-initializing...");
    const parentPageId = extractNotionPageId(parentPageUrl);
    cfg = await initializeNotionBrainBase({ apiKey, parentPageId });
    await storageAdapter.set({ notionBackendConfig: cfg, storageBackend: "notion" });
    console.log("[BackendFactory] Notion auto-initialized and saved to storage.");
  }

  if (!cfg || !apiKey) {
    console.warn("[BackendFactory] Notion backend selected but config or API key is missing.");
    return null;
  }

  const operator = new NotionTableOperator(apiKey);
  return createWorker("notion", operator, cfg.tableIds);
}
