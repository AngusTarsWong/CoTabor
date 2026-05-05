/**
 * Notion OAuth utilities for browser extension.
 *
 * Requires a Notion "Public Integration" (client_id + client_secret).
 * Uses chrome.identity.launchWebAuthFlow for browser-based OAuth.
 *
 * Storage key: "notionSession" in chrome.storage.local
 * Shape: NotionTokenSession
 */

export interface NotionTokenSession {
  access_token: string;   // ntn_*** or Bearer token from OAuth
  workspace_id?: string;
  workspace_name?: string;
  user_name?: string;
  saved_at: number;       // ms timestamp — Notion OAuth tokens don't expire
}

const STORAGE_KEY = "notionSession";

// ─── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an OAuth authorization code for a Notion access token.
 * Uses HTTP Basic auth with clientId:clientSecret per Notion spec.
 */
export async function getNotionAccessTokenFromCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<NotionTokenSession> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization:    `Basic ${credentials}`,
      "Content-Type":   "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Notion OAuth 换取 Token 失败: ${err.error_description ?? err.message ?? res.statusText}`);
  }

  const data = await res.json() as any;
  return {
    access_token:   data.access_token,
    workspace_id:   data.workspace_id,
    workspace_name: data.workspace_name,
    user_name:      data.owner?.user?.name ?? data.workspace_name ?? "Notion 用户",
    saved_at:       Date.now(),
  };
}

// ─── Session manager ───────────────────────────────────────────────────────────

export class NotionAuthManager {
  private static instance: NotionAuthManager;

  private constructor() {}

  static getInstance(): NotionAuthManager {
    if (!NotionAuthManager.instance) {
      NotionAuthManager.instance = new NotionAuthManager();
    }
    return NotionAuthManager.instance;
  }

  async loadSession(): Promise<NotionTokenSession | null> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as NotionTokenSession) ?? null;
  }

  async saveSession(session: NotionTokenSession): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: session });
    // Also persist the access_token as notionApiKey so NotionTableOperator picks it up
    await chrome.storage.local.set({ notionApiKey: session.access_token });
    console.log("[NotionAuthManager] Credentials saved to chrome.storage.local");
  }

  async clearSession(): Promise<void> {
    await chrome.storage.local.remove([STORAGE_KEY, "notionApiKey"]);
  }

  /** True if a session exists (doesn't validate expiry — Notion tokens are long-lived). */
  async isAuthorized(): Promise<boolean> {
    const session = await this.loadSession();
    return !!session?.access_token;
  }

  /** Return the stored access token, or throw if not authorized. */
  async getAccessToken(): Promise<string> {
    const session = await this.loadSession();
    if (!session?.access_token) {
      throw new Error("NOTION_AUTH_REQUIRED: 未授权，请先完成 Notion OAuth 授权。");
    }
    return session.access_token;
  }
}

// ─── OAuth flow helpers ────────────────────────────────────────────────────────

/**
 * Launch the Notion OAuth authorization page via chrome.identity.
 * Returns the authorization code on success.
 *
 * @param clientId  Notion OAuth client_id (from Public Integration)
 */
export async function launchNotionOAuth(clientId: string): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.identity) {
    throw new Error("chrome.identity API 不可用，请在插件环境中运行。");
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id",     clientId);
  authUrl.searchParams.set("redirect_uri",  redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner",         "user");

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url:         authUrl.toString(),
      interactive: true,
    });
  } catch (e: any) {
    throw new Error(`OAuth 授权被取消或失败: ${e.message}`);
  }

  if (!responseUrl) throw new Error("未收到回调 URL，授权可能已被取消。");

  const code = new URL(responseUrl).searchParams.get("code");
  if (!code) throw new Error("回调 URL 中没有 code 参数，授权失败。");

  return code;
}
