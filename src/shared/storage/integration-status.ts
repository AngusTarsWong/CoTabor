import { NotionAuthManager } from "../utils/notion-auth";

export type IntegrationStatus = {
  activeMemoryBackend: "notion" | null;
  notion: {
    authorized: boolean;
    configured: boolean;
    active: boolean;
    pageUrl: string;
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
    "llmConfig",
    "mcpServers",
  ]);

  const storageBackend = stored.storageBackend as "notion" | undefined;
  const notionSession = await NotionAuthManager.getInstance().loadSession();

  const notionAuthorized = !!notionSession?.access_token;
  const notionConfigured = !!(
    stored.notionBackendConfig &&
    isValidTableConfig(stored.notionBackendConfig.tableIds) &&
    stored.notionParentPageUrl
  );

  const notionActive = storageBackend === "notion" && notionConfigured;

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
