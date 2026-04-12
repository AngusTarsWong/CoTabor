import { TableOperator, TableConfig, FieldFilter } from "../../../shared/types/operator";
import { getLarkToken } from "../../../shared/utils/lark-utils";

/** Maps normalized FieldFilter operators to Feishu Bitable filter operators. */
const FEISHU_OP_MAP: Record<string, string> = {
  eq:       'is',
  gt:       'isGreater',
  lt:       'isLess',
  gte:      'isGreaterEqual',
  lte:      'isLessEqual',
  contains: 'contains',
};

/**
 * Feishu Bitable implementation of TableOperator.
 * A lightweight wrapper around Feishu Bitable OpenAPI.
 */
export class FeishuTableOperator implements TableOperator {
  public config: TableConfig;

  constructor(config: TableConfig) {
    this.config = config;
  }

  /** Helper: send an authenticated request to the Feishu Bitable API. */
  public async request(method: string, endpoint: string, body?: any) {
    const token = await getLarkToken(this.config.appId, this.config.appSecret);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps${this.config.appToken ? '/' + this.config.appToken : ''}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
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

  /** Create a new Bitable App (document). */
  async createBitableApp(name: string, folderToken?: string) {
    const body: any = { name };
    if (folderToken) body.folder_token = folderToken;
    const originalToken = this.config.appToken;
    this.config.appToken = '';
    const res = await this.request('POST', '', body);
    this.config.appToken = originalToken;
    return res.app;
  }

  /** Get all tables in the current Bitable App. */
  async getTables() {
    return this.request('GET', '/tables');
  }

  /** Create a new table in the current Bitable App. */
  async createTable(name: string, defaultField?: { field_name: string; type: number }) {
    return this.request('POST', '/tables', {
      table: { name, default_view_name: 'Default', fields: defaultField ? [defaultField] : [] },
    });
  }

  /**
   * Search records using normalized FieldFilter[].
   * Translates to Feishu's conjunction/conditions format internally.
   */
  async searchRecords(tableId: string, filters?: FieldFilter[]): Promise<{ items: any[] }> {
    const body: any = {};
    if (filters && filters.length > 0) {
      body.filter = {
        conjunction: 'and',
        conditions: filters.map(f => ({
          field_name: f.field,
          operator: FEISHU_OP_MAP[f.op] ?? 'is',
          value: [String(f.value)],
        })),
      };
    }
    return this.request('POST', `/tables/${tableId}/records/search`, body);
  }

  /** Internal helper for ID equality lookup (bypasses FieldFilter). */
  private async findByCustomId(tableId: string, customId: string): Promise<any> {
    return this.request('POST', `/tables/${tableId}/records/search`, {
      filter: {
        conjunction: 'and',
        conditions: [{ field_name: 'id', operator: 'is', value: [customId] }],
      },
    });
  }

  /** Create a new record. */
  async createRecord(tableId: string, fields: Record<string, any>): Promise<void> {
    await this.request('POST', `/tables/${tableId}/records`, { fields });
  }

  /** Update a record by our custom `id` field. Creates if not found. */
  async updateRecordByCustomId(tableId: string, customId: string, fields: Record<string, any>): Promise<void> {
    const searchRes = await this.findByCustomId(tableId, customId);
    if (!searchRes.items || searchRes.items.length === 0) {
      return this.createRecord(tableId, fields);
    }
    const feishuRecordId = searchRes.items[0].record_id;
    await this.request('PUT', `/tables/${tableId}/records/${feishuRecordId}`, { fields });
  }

  /** Delete a record by our custom `id` field. */
  async deleteRecordByCustomId(tableId: string, customId: string): Promise<void> {
    const searchRes = await this.findByCustomId(tableId, customId);
    if (!searchRes.items || searchRes.items.length === 0) return;
    const feishuRecordId = searchRes.items[0].record_id;
    await this.request('DELETE', `/tables/${tableId}/records/${feishuRecordId}`);
  }
}
