import { TableOperator, TableConfig } from "../../../shared/types/operator";

/**
 * Feishu Bitable Implementation of the TableOperator interface.
 * A lightweight wrapper around Feishu Bitable OpenAPI.
 */
export class FeishuTableOperator implements TableOperator {
  public config: TableConfig;
  private tenantAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: TableConfig) {
    this.config = config;
  }

  /**
   * Automatically manage Tenant Access Token
   */
  private async getAccessToken(): Promise<string> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpiresAt) {
      return this.tenantAccessToken as string;
    }

    const url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get Feishu token: ${data.msg}`);
    }

    this.tenantAccessToken = data.tenant_access_token;
    // Expire 5 minutes early to be safe
    this.tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;
    return this.tenantAccessToken as string;
  }

  /**
   * Helper to format API requests
   */
  private async request(method: string, endpoint: string, body?: any) {
    const token = await this.getAccessToken();
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.appToken}${endpoint}`;
    
    const options: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`Feishu API Error [${data.code}]: ${data.msg}`);
    }
    return data.data;
  }

  /**
   * Search records in a Bitable table
   */
  async searchRecords(tableId: string, filter?: any) {
    return this.request("POST", `/tables/${tableId}/records/search`, filter ? { filter } : {});
  }

  /**
   * Create a new record
   */
  async createRecord(tableId: string, fields: any) {
    return this.request("POST", `/tables/${tableId}/records`, { fields });
  }

  /**
   * Update an existing record
   * Note: Feishu requires the Record_ID (which is different from our custom 'id' field).
   */
  async updateRecordByCustomId(tableId: string, customId: string, fields: any) {
    // 1. Search to find the Feishu record_id
    const searchRes = await this.searchRecords(tableId, {
      conjunction: "and",
      conditions: [{ field_name: "id", operator: "is", value: [customId] }]
    });

    if (!searchRes.items || searchRes.items.length === 0) {
      // If it doesn't exist on cloud, fallback to create
      return this.createRecord(tableId, fields);
    }

    const feishuRecordId = searchRes.items[0].record_id;

    // 2. Update it
    return this.request("PUT", `/tables/${tableId}/records/${feishuRecordId}`, { fields });
  }
}
