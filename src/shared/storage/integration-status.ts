import { NotionAuthManager } from "../utils/notion-auth";
import { FeishuAuthManager } from "../utils/feishu-auth";
import { MemoryBackendType } from "../types/integration";

export type IntegrationStatus = {
  activeMemoryBackend: MemoryBackendType | null;
  notion: {
    authorized: boolean;
    configured: boolean;
    active: boolean;
    pageUrl: string;
  };
  feishu: {
    authorized: boolean;
    configured: boolean;
    active: boolean;
  };
  llm: {
    configured: boolean;
  };
  mcp: {
    enabledCount: number;
  };
  skills: {
    loadedCount: number;
  };
};

export const DEFAULT_INTEGRATION_STATUS: IntegrationStatus = {
  activeMemoryBackend: null,
  notion: {
    authorized: false,
    configured: false,
    active: false,
    pageUrl: "",
  },
  feishu: {
    authorized: false,
    configured: false,
    active: false,
  },
  llm: {
    configured: false,
  },
  mcp: {
    enabledCount: 0,
  },
  skills: {
    loadedCount: 0,
  },
};

function isValidTableConfig(tableIds: any): boolean {
  return !!(tableIds?.L1 && tableIds?.L2 && tableIds?.L3);
}

export async function loadIntegrationStatus(): Promise<IntegrationStatus> {
  const stored = await chrome.storage.local.get([
    "storageBackend",
    "notionBackendConfig",
    "notionParentPageUrl",
    "feishuAppId",
    "feishuAppSecret",
    "llmConfig",
    "mcpServers",
  ]);

  const storageBackend = stored.storageBackend as MemoryBackendType | undefined;
  const notionSession = await NotionAuthManager.getInstance().loadSession();
  const feishuSession = await FeishuAuthManager.getInstance().loadSession();

  const notionAuthorized = !!notionSession?.access_token;
  const notionConfigured = !!(
    stored.notionBackendConfig &&
    isValidTableConfig(stored.notionBackendConfig.tableIds) &&
    stored.notionParentPageUrl
  );

  const notionActive = storageBackend === "notion" && notionConfigured;
  const feishuAuthorized = !!feishuSession?.access_token;
  const feishuConfigured = !!(stored.feishuAppId && stored.feishuAppSecret);

  const llmConfig = stored.llmConfig || {};
  const llmConfigured = !!(
    llmConfig.VITE_LLM_API_KEY &&
    llmConfig.VITE_LLM_BASE_URL &&
    llmConfig.VITE_LLM_MODEL
  );

  const mcpServers = stored.mcpServers || {};
  const enabledCount = Object.values(mcpServers).filter(
    (server: any) => server?.enabled !== false
  ).length;

  return {
    activeMemoryBackend: notionActive ? "notion" : null,
    notion: {
      authorized: notionAuthorized,
      configured: notionConfigured,
      active: notionActive,
      pageUrl: stored.notionParentPageUrl || "",
    },
    feishu: {
      authorized: feishuAuthorized,
      configured: feishuConfigured,
      active: false,
    },
    llm: {
      configured: llmConfigured,
    },
    mcp: {
      enabledCount,
    },
    skills: {
      loadedCount: 0,
    },
  };
}
