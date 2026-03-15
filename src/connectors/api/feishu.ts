
/**
 * Feishu Open API Client
 * 负责与飞书 API 通信，处理鉴权和数据获取
 */

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

interface TenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

export class FeishuClient {
  private appId: string;
  private appSecret: string;
  private token: string | null = null;
  private tokenExpire: number = 0;

  constructor(config: FeishuConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  /**
   * 获取有效的 Tenant Access Token
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now() / 1000;
    
    // 如果 token 存在且未过期（提前 5 分钟刷新），直接返回
    if (this.token && this.tokenExpire > now + 300) {
      return this.token;
    }

    console.log('[FeishuClient] Refreshing access token...');
    
    try {
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
      });

      const data: TenantAccessTokenResponse = await response.json();

      if (data.code !== 0) {
        throw new Error(`Failed to get access token: ${data.msg} (code: ${data.code})`);
      }

      this.token = data.tenant_access_token;
      this.tokenExpire = now + data.expire;
      
      console.log('[FeishuClient] Access token refreshed successfully.');
      return this.token;
    } catch (error) {
      console.error('[FeishuClient] Error fetching access token:', error);
      throw error;
    }
  }

  /**
   * 通用的 API 请求方法
   */
  async request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const url = path.startsWith('http') ? path : `https://open.feishu.cn/open-apis${path}`;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Feishu API Request Failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * 获取 Docx 文档的所有块 (Blocks)
   * https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/list_blocks
   */
  async getDocumentBlocks(documentId: string): Promise<any[]> {
    let pageToken = '';
    let allBlocks: any[] = [];
    let hasMore = true;

    console.log(`[FeishuClient] Fetching blocks for document: ${documentId}`);

    while (hasMore) {
      const query = pageToken ? `?page_token=${pageToken}&page_size=500` : `?page_size=500`;
      const result: any = await this.request(`/docx/v1/documents/${documentId}/blocks${query}`, {
        method: 'GET',
      });

      if (result.code !== 0) {
        throw new Error(`Failed to get blocks: ${result.msg}`);
      }

      const items = result.data.items || [];
      allBlocks = allBlocks.concat(items);
      
      hasMore = result.data.has_more;
      pageToken = result.data.page_token;
    }

    console.log(`[FeishuClient] Fetched ${allBlocks.length} blocks.`);
    return allBlocks;
  }

  /**
   * 获取文档元数据
   */
  async getDocumentInfo(documentId: string): Promise<any> {
    const result: any = await this.request(`/docx/v1/documents/${documentId}`, {
      method: 'GET',
    });

    if (result.code !== 0) {
       // Fallback: 如果直接获取 docx 信息失败，尝试作为一个 block 获取
       // 有时候 docId 本身就是一个 blockId
       return null;
    }
    return result.data.document;
  }
}
