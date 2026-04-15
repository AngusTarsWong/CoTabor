import * as fs from 'fs';
import * as path from 'path';
import { ENV } from '../constants/env';
import { getTenantAccessToken } from './lark-utils';

export interface LarkTokenSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Timestamp in ms
  refresh_expires_at: number; // Timestamp in ms
  user_name?: string;
}

 /**
 * 交换授权码为 user_access_token
 */
export async function getAccessTokenFromCode(code: string, appId: string, appSecret: string): Promise<LarkTokenSession> {
  // 1. 获取 App Access Token
  const appTokenRes = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const { app_access_token } = await appTokenRes.json() as any;

  // 2. 用 code 换取 user_access_token
  const tokenRes = await fetch("https://open.feishu.cn/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${app_access_token}`
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: code
    })
  });

  const data: any = await tokenRes.json();
  if (data.code !== 0) {
    throw new Error(`换取 Token 失败: ${data.msg} (Code: ${data.code})`);
  }

  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: Date.now() + (data.data.expires_in * 1000),
    refresh_expires_at: Date.now() + (data.data.refresh_expires_in * 1000),
    user_name: data.data.name || "飞书用户"
  };
}

export class LarkAuthManager {
  private static instance: LarkAuthManager;
  private sessionPath: string;
  private isBrowserEnv: boolean;

  private constructor() {
    this.isBrowserEnv = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local !== undefined;
    if (!this.isBrowserEnv) {
      const rootDir = process.cwd();
      this.sessionPath = path.resolve(rootDir, ENV.LARK_AUTH_PATH);
    } else {
      this.sessionPath = 'lark_auth_session';
    }
  }

  public static getInstance(): LarkAuthManager {
    if (!LarkAuthManager.instance) {
      LarkAuthManager.instance = new LarkAuthManager();
    }
    return LarkAuthManager.instance;
  }

  /**
   * Check if we have a saved session (async in browser, sync in node)
   */
  public async isUserIdentityAvailableAsync(): Promise<boolean> {
    if (this.isBrowserEnv) {
      const result = await chrome.storage.local.get([this.sessionPath]);
      return !!result[this.sessionPath];
    }
    // Node.js: 环境变量优先，其次本地缓存文件
    return !!(process.env.LARK_ACCESS_TOKEN || fs.existsSync(this.sessionPath));
  }

  public async getAccessToken(): Promise<string> {
    const session = await this.loadSessionAsync();
    if (!session) {
      throw new Error("LARK_AUTH_REQUIRED: 飞书身份凭证不存在，请扫码登录。");
    }

    const now = Date.now();
    
    if (session.expires_at > now + 300000) {
      return session.access_token;
    }

    if (session.refresh_expires_at < now) {
      throw new Error("LARK_AUTH_EXPIRED: 飞书授权已彻底过期（超过30天），请重新扫码。");
    }

    console.log("[LarkAuthManager] 检测到 Token 已过期，正在执行静默续期...");
    return await this.refreshSession(session);
  }

  public async saveSessionAsync(session: LarkTokenSession): Promise<void> {
    if (this.isBrowserEnv) {
      await chrome.storage.local.set({ [this.sessionPath]: session });
      console.log(`[LarkAuthManager] 飞书凭证已成功保存至 chrome.storage.local`);
    } else {
      try {
        fs.writeFileSync(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
        console.log(`[LarkAuthManager] 飞书凭证已成功保存至: ${this.sessionPath}`);
      } catch (err: any) {
        console.error(`[LarkAuthManager] 保存凭证失败: ${err.message}`);
      }
    }
  }

  public saveSession(session: LarkTokenSession): void {
    if (this.isBrowserEnv) {
      chrome.storage.local.set({ [this.sessionPath]: session }).then(() => {
        console.log(`[LarkAuthManager] 飞书凭证已成功保存至 chrome.storage.local`);
      });
    } else {
      try {
        fs.writeFileSync(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
        console.log(`[LarkAuthManager] 飞书凭证已成功保存至: ${this.sessionPath}`);
      } catch (err: any) {
        console.error(`[LarkAuthManager] 保存凭证失败: ${err.message}`);
      }
    }
  }

  public async loadSessionAsync(): Promise<LarkTokenSession | null> {
    if (this.isBrowserEnv) {
      const result = await chrome.storage.local.get([this.sessionPath]);
      return result[this.sessionPath] || null;
    } else {
      return this.loadSession();
    }
  }

  private loadSession(): LarkTokenSession | null {
    // 1. 优先从环境变量读取（适合脚本运行 / CI / 开源贡献者）
    if (process.env.LARK_ACCESS_TOKEN) {
      return {
        access_token:        process.env.LARK_ACCESS_TOKEN,
        refresh_token:       process.env.LARK_REFRESH_TOKEN || "",
        expires_at:          Number(process.env.LARK_EXPIRES_AT || "0"),
        refresh_expires_at:  Number(process.env.LARK_REFRESH_EXPIRES_AT || "0"),
      };
    }
    // 2. 回退到本地缓存文件（.lark_auth.json，已加入 .gitignore，永远不提交）
    if (!fs.existsSync(this.sessionPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.sessionPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private async refreshSession(oldSession: LarkTokenSession): Promise<string> {
    const appId = ENV.LARK_APP_ID;
    const appSecret = ENV.LARK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error("LARK_CONFIG_MISSING: 缺少 VITE_LARK_APP_ID 或 VITE_LARK_APP_SECRET");
    }

    try {
      const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/refresh_access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await getTenantAccessToken(appId, appSecret)}`
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: oldSession.refresh_token
        })
      });

      const data: any = await response.json();
      if (data.code !== 0) {
        throw new Error(`刷新失败: ${data.msg} (Code: ${data.code})`);
      }

      const newSession: LarkTokenSession = {
        access_token: data.data.access_token,
        refresh_token: data.data.refresh_token,
        expires_at: Date.now() + (data.data.expires_in * 1000),
        refresh_expires_at: Date.now() + (data.data.refresh_expires_in * 1000),
        user_name: data.data.name || oldSession.user_name
      };

      await this.saveSessionAsync(newSession);
      return newSession.access_token;
    } catch (err: any) {
      console.error(`[LarkAuthManager] 自动续期失败，可能需要重新扫码: ${err.message}`);
      throw new Error(`LARK_REFRESH_FAILED: 续期失败，请重新运行登录脚本。`);
    }
  }
}
