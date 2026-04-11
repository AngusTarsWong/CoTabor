import { TableOperator, TableConfig } from "../../../shared/types/operator";
import { getLarkToken } from "../../../shared/utils/lark-utils";

/**
 * Feishu Bitable Implementation of the TableOperator interface.
 * A lightweight wrapper around Feishu Bitable OpenAPI.
 */
export class FeishuTableOperator implements TableOperator {
  public config: TableConfig;

  constructor(config: TableConfig) {
    this.config = config;
  }

  /**
   * Helper to format API requests
   */
  public async request(method: string, endpoint: string, body?: any) {
    // 自动选择 Token: 优先使用本地存在的个人身份 (UAT), 如果没有再降级到应用身份 (TAT)
    const token = await getLarkToken(this.config.appId, this.config.appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps${this.config.appToken ? '/' + this.config.appToken : ''}${endpoint}`;
    
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
   * Create a new Bitable App (Document)
   * Note: endpoint starts without /apps prefix in our helper
   */
  async createBitableApp(name: string, folderToken?: string) {
    const body: any = { name };
    if (folderToken) body.folder_token = folderToken;
    // We temporarily clear appToken for this request because it's a global endpoint
    const originalToken = this.config.appToken;
    this.config.appToken = ''; 
    const res = await this.request("POST", "", body);
    this.config.appToken = originalToken;
    return res.app;
  }

  /**
   * Get all tables in the current Bitable App
   */
  async getTables() {
    return this.request("GET", "/tables");
  }

  /**
   * Create a new table in the current Bitable App
   */
  async createTable(name: string, defaultField?: { field_name: string; type: number }) {
    return this.request("POST", "/tables", { table: { name, default_view_name: "Default", fields: defaultField ? [defaultField] : [] } });
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

  /**
   * Delete a record by our custom ID field.
   * Looks up the Feishu record_id first, then issues DELETE.
   */
  async deleteRecordByCustomId(tableId: string, customId: string) {
    const searchRes = await this.searchRecords(tableId, {
      conjunction: "and",
      conditions: [{ field_name: "id", operator: "is", value: [customId] }]
    });

    if (!searchRes.items || searchRes.items.length === 0) {
      // Record doesn't exist on cloud — nothing to delete
      return;
    }

    const feishuRecordId = searchRes.items[0].record_id;
    return this.request("DELETE", `/tables/${tableId}/records/${feishuRecordId}`);
  }
}
