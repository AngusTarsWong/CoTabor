import { SyncWorker } from "./sync-worker";
import { FeishuTableOperator } from "../../skills/bundled/feishu-operator/api";
import { NotionTableOperator } from "../../skills/bundled/notion-operator/api";
import { initializeNotionBrainBase, extractNotionPageId } from "../../skills/bundled/notion-operator/init";
import { LarkAuthManager } from "../../shared/utils/lark-auth";
import { FeishuBackendConfig, NotionBackendConfig, SyncBackendType } from "../../shared/types/operator";
import { storageAdapter } from "../../runner/storage-adapter";

function createWorker(
  backendType: SyncBackendType,
  operator: FeishuTableOperator | NotionTableOperator,
  tableIds: { L1: string; L2: string; L3: string },
): SyncWorker {
  console.log(`[BackendFactory] Using ${backendType === "notion" ? "Notion" : "Feishu"} backend.`);
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
    "brainBaseConfig",   // Feishu legacy key
    "notionBackendConfig",
    "notionApiKey",
    "notionParentPageUrl",
    "larkAppId",
    "larkAppSecret",
  ]);

  const backend: "feishu" | "notion" = stored.storageBackend ?? "feishu";

  // ── Feishu ────────────────────────────────────────────────────────────────
  if (backend === "feishu") {
    const cfg = stored.brainBaseConfig as (FeishuBackendConfig & { memoriesTableIds?: any }) | undefined;
    if (!cfg) {
      console.warn("[BackendFactory] Feishu backend selected but brainBaseConfig not found.");
      return null;
    }

    const appId:     string = stored.larkAppId     ?? "";
    const appSecret: string = stored.larkAppSecret ?? "";

    // brainBaseConfig may use either memoriesAppToken (new) or appToken (legacy)
    const appToken: string =
      cfg.memoriesAppToken ??
      (cfg as any).appToken ??
      "";

    // tableIds may be nested as memoriesTableIds in old configs
    const tableIds = cfg.tableIds ?? (cfg as any).memoriesTableIds ?? { L1: "", L2: "", L3: "" };

    const operator = new FeishuTableOperator({ appId, appSecret, appToken, tableIds });

    return createWorker("feishu", operator, tableIds);
  }

  // ── Notion ────────────────────────────────────────────────────────────────
  if (backend === "notion") {
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

  console.warn("[BackendFactory] Unknown storageBackend value:", backend);
  return null;
}
