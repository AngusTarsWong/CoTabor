import { NotionBackendConfig } from "../shared/types/operator";

export interface StorageAdapter {
  get(keys: string[]): Promise<Record<string, any>>;
  set(data: Record<string, any>): Promise<void>;
}

// Default adapter: wraps chrome.storage.local (extension behavior unchanged)
const defaultAdapter: StorageAdapter = {
  async get(keys) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      return chrome.storage.local.get(keys);
    }
    return {};
  },
  async set(data) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set(data);
    }
  },
};

let activeAdapter: StorageAdapter = defaultAdapter;

export function setStorageAdapter(adapter: StorageAdapter): void {
  activeAdapter = adapter;
}

// Global proxy — all memory modules import this instead of calling chrome.storage directly
export const storageAdapter: StorageAdapter = {
  get: (keys) => activeAdapter.get(keys),
  set: (data) => activeAdapter.set(data),
};

/**
 * Node.js adapter: reads Notion / Feishu config from process.env.
 *
 * Required env vars (add to .env):
 *   STORAGE_BACKEND=notion           (default: notion)
 *   VITE_NOTION_API_KEY=ntn_xxx
 *   NOTION_TABLE_L1=<database-id>
 *   NOTION_TABLE_L2=<database-id>
 *   NOTION_TABLE_L3=<database-id>
 *   NOTION_TABLE_TASK_RUNS=<database-id>
 *   NOTION_TABLE_RAW_TRACES=<database-id>
 */
export class NodeStorageAdapter implements StorageAdapter {
  async get(keys: string[]): Promise<Record<string, any>> {
    const env = process.env;
    const backend = env.STORAGE_BACKEND ?? "notion";

    const notionBackendConfig: NotionBackendConfig = {
      type: "notion",
      tableIds: {
        L1: env.NOTION_TABLE_L1 ?? "",
        L2: env.NOTION_TABLE_L2 ?? "",
        L3: env.NOTION_TABLE_L3 ?? "",
      },
      taskTableIds: {
        TaskRuns: env.NOTION_TABLE_TASK_RUNS ?? "",
        RawTraces: env.NOTION_TABLE_RAW_TRACES ?? "",
      },
    };

    const all: Record<string, any> = {
      storageBackend: backend,
      notionApiKey: env.VITE_NOTION_API_KEY ?? "",
      notionBackendConfig,
      larkAppId: env.VITE_LARK_APP_ID ?? "",
      larkAppSecret: env.VITE_LARK_APP_SECRET ?? "",
    };

    return Object.fromEntries(keys.map((k) => [k, all[k]]));
  }

  async set(_data: Record<string, any>): Promise<void> {
    // Node.js scripts don't persist storage; env vars are read-only
  }
}
