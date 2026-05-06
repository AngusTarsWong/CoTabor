export interface FeishuTokenSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  refresh_expires_at?: number;
  user_name?: string;
  tenant_name?: string;
  saved_at: number;
}

const STORAGE_KEY = "feishuSession";

export class FeishuAuthManager {
  private static instance: FeishuAuthManager;

  private constructor() {}

  static getInstance(): FeishuAuthManager {
    if (!FeishuAuthManager.instance) {
      FeishuAuthManager.instance = new FeishuAuthManager();
    }
    return FeishuAuthManager.instance;
  }

  async loadSession(): Promise<FeishuTokenSession | null> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as FeishuTokenSession) ?? null;
  }

  async saveSession(session: FeishuTokenSession): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: session });
    console.log("[FeishuAuthManager] Session saved to chrome.storage.local");
  }

  async clearSession(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  async isAuthorized(): Promise<boolean> {
    const session = await this.loadSession();
    return !!session?.access_token;
  }

  async getAccessToken(): Promise<string> {
    const session = await this.loadSession();
    if (!session?.access_token) {
      throw new Error("FEISHU_AUTH_REQUIRED: 未授权，请先完成飞书授权。");
    }
    return session.access_token;
  }
}
