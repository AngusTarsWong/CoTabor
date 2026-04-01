import * as fs from 'fs';
import * as path from 'path';
import { ENV } from '../constants/env';

export interface LarkTokenSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Timestamp in ms
  refresh_expires_at: number; // Timestamp in ms
  user_name?: string;
}

export class LarkAuthManager {
  private static instance: LarkAuthManager;
  private sessionPath: string;

  private constructor() {
    // Determine the absolute path for the session file
    // In Node.js environment, we use the root of the project
    const rootDir = process.cwd();
    this.sessionPath = path.resolve(rootDir, ENV.LARK_AUTH_PATH);
  }

  public static getInstance(): LarkAuthManager {
    if (!LarkAuthManager.instance) {
      LarkAuthManager.instance = new LarkAuthManager();
    }
    return LarkAuthManager.instance;
  }

  /**
   * Check if we have a saved session (even if expired, as long as refreshable)
   */
  public isUserIdentityAvailable(): boolean {
    return fs.existsSync(this.sessionPath);
  }

  /**
   * Get a valid access token. 
   * Automates the refresh flow if the token is expired but refresh_token is still valid.
   * Throws Error if re-login is required.
   */
  public async getAccessToken(): Promise<string> {
    const session = this.loadSession();
    if (!session) {
      throw new Error("LARK_AUTH_REQUIRED: 飞书身份凭证不存在，请运行 'npx tsx scripts/lark-login.ts' 重新登录。");
    }

    const now = Date.now();
    
    // 1. If access token is still valid (with 5-min buffer)
    if (session.expires_at > now + 300000) {
      return session.access_token;
    }

    // 2. Access token expired, check if refresh token is still valid
    if (session.refresh_expires_at < now) {
      throw new Error("LARK_AUTH_EXPIRED: 飞书授权已彻底过期（超过30天），请运行 'npx tsx scripts/lark-login.ts' 重新扫码。");
    }

    // 3. Try refreshing
    console.log("[LarkAuthManager] 检测到 Token 已过期，正在执行静默续期...");
    return await this.refreshSession(session);
  }

  /**
   * Save a new session to disk
   */
  public saveSession(session: LarkTokenSession): void {
    try {
      fs.writeFileSync(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
      console.log(`[LarkAuthManager] 飞书凭证已成功保存至: ${this.sessionPath}`);
    } catch (err: any) {
      console.error(`[LarkAuthManager] 保存凭证失败: ${err.message}`);
    }
  }

  private loadSession(): LarkTokenSession | null {
    if (!this.isUserIdentityAvailable()) return null;
    try {
      const data = fs.readFileSync(this.sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  private async refreshSession(oldSession: LarkTokenSession): Promise<string> {
    const appId = ENV.LARK_APP_ID;
    const appSecret = ENV.LARK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error("LARK_CONFIG_MISSING: .env 中缺少 VITE_LARK_APP_ID 或 VITE_LARK_APP_SECRET");
    }

    try {
      // 飞书刷新 Token 的接口
      const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/refresh_access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await this.getInternalAppToken(appId, appSecret)}`
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

      this.saveSession(newSession);
      return newSession.access_token;
    } catch (err: any) {
      console.error(`[LarkAuthManager] 自动续期失败，可能需要重新扫码: ${err.message}`);
      throw new Error(`LARK_REFRESH_FAILED: 续期失败，请重新运行登录脚本。`);
    }
  }

  /**
   * 获取应用自身的 token，用于授权刷新
   */
  private async getInternalAppToken(appId: string, appSecret: string): Promise<string> {
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const data: any = await res.json();
    return data.tenant_access_token;
  }
}
