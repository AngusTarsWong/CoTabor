import { NotionBackendConfig } from "../shared/types/operator";
import { initializeNotionBrainBase, extractNotionPageId } from "../skills/bundled/notion-operator/init";
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
 * Auto-initializes Notion if NOTION_API_KEY (or the legacy VITE_NOTION_API_KEY)
 * plus NOTION_PARENT_PAGE_URL are set in .env but .notion_config.local.json
 * does not yet exist.
 * The result is cached to .notion_config.local.json for subsequent runs.
 * Run `npm run tool:init-notion` only when you need to force a rebuild.
 */
export class NodeStorageAdapter implements StorageAdapter {
  async get(keys: string[]): Promise<Record<string, any>> {
    const env = process.env;
    const apiKey = env.NOTION_API_KEY ?? env.VITE_NOTION_API_KEY ?? "";

    let notionBackendConfig: NotionBackendConfig | undefined;
    try {
      const configPath = path.resolve(process.cwd(), NOTION_LOCAL_CONFIG_PATH);
      const raw = fs.readFileSync(configPath, "utf-8");
      notionBackendConfig = JSON.parse(raw) as NotionBackendConfig;
    } catch {
      // Cache file missing — attempt auto-init if credentials are available
    }

    if (!notionBackendConfig) {
      const parentPageUrl = env.NOTION_PARENT_PAGE_URL ?? "";
      if (apiKey && parentPageUrl) {
        console.log("[NodeStorageAdapter] Auto-initializing Notion brain base...");
        const parentPageId = extractNotionPageId(parentPageUrl);
        notionBackendConfig = await initializeNotionBrainBase({ apiKey, parentPageId });
        const configPath = path.resolve(process.cwd(), NOTION_LOCAL_CONFIG_PATH);
        fs.writeFileSync(configPath, JSON.stringify(notionBackendConfig, null, 2), "utf-8");
        console.log("[NodeStorageAdapter] Notion initialized and cached to", NOTION_LOCAL_CONFIG_PATH);
      }
    }

    const all: Record<string, any> = {
      storageBackend: notionBackendConfig ? "notion" : "feishu",
      notionApiKey: apiKey,
      notionParentPageUrl: env.NOTION_PARENT_PAGE_URL ?? "",
      notionBackendConfig,
      larkAppId: env.LARK_APP_ID ?? env.VITE_LARK_APP_ID ?? "",
      larkAppSecret: env.LARK_APP_SECRET ?? env.VITE_LARK_APP_SECRET ?? "",
    };

    return Object.fromEntries(keys.map((k) => [k, all[k]]));
  }

  async set(_data: Record<string, any>): Promise<void> {
    // Node.js adapter is read-only; auto-init writes happen inside get()
  }
}
