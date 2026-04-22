import { NotionBackendConfig } from "../shared/types/operator";
import fs from "fs";
import path from "path";

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
 * Local cache file written by `npm run tool:init-notion`.
 * Same pattern as .lark_auth.json — never committed.
 */
export const NOTION_LOCAL_CONFIG_PATH = ".notion_config.local.json";

/**
 * Node.js adapter: mirrors the extension's logic.
 *
 * The extension asks the user for a Parent Page URL and calls
 * initializeNotionBrainBase() to auto-discover L1/L2/L3 table IDs.
 * This adapter reads the result of that same call from a local cache file
 * (.notion_config.local.json) written by `npm run tool:init-notion`.
 *
 * Required .env vars:
 *   VITE_NOTION_API_KEY=ntn_xxx
 *   NOTION_PARENT_PAGE_URL=https://www.notion.so/...   (used by tool:init-notion only)
 *
 * One-time setup:
 *   npm run tool:init-notion   →  creates .notion_config.local.json
 */
export class NodeStorageAdapter implements StorageAdapter {
  async get(keys: string[]): Promise<Record<string, any>> {
    const env = process.env;
    const apiKey = env.VITE_NOTION_API_KEY ?? "";

    // Read the config written by tool:init-notion (same data as chrome.storage.local)
    let notionBackendConfig: NotionBackendConfig | undefined;
    try {
      const configPath = path.resolve(process.cwd(), NOTION_LOCAL_CONFIG_PATH);
      const raw = fs.readFileSync(configPath, "utf-8");
      notionBackendConfig = JSON.parse(raw) as NotionBackendConfig;
    } catch {
      // Not yet initialized — user needs to run tool:init-notion first
    }

    const all: Record<string, any> = {
      storageBackend: notionBackendConfig ? "notion" : "feishu",
      notionApiKey: apiKey,
      notionBackendConfig,
      larkAppId: env.VITE_LARK_APP_ID ?? "",
      larkAppSecret: env.VITE_LARK_APP_SECRET ?? "",
    };

    return Object.fromEntries(keys.map((k) => [k, all[k]]));
  }

  async set(_data: Record<string, any>): Promise<void> {
    // Node.js adapter is read-only; writes happen via tool:init-notion
  }
}
