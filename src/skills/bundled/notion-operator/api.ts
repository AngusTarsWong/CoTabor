import { TableOperator, FieldFilter } from "../../../shared/types/operator";

const NOTION_VERSION = "2022-06-28";
const BASE_URL = "https://api.notion.com/v1";

/**
 * Maps our memory field names to their Notion property types.
 * All fields default to rich_text unless listed here.
 */
const FIELD_TYPE_MAP: Record<string, "title" | "rich_text" | "number"> = {
  // Common ID field — must be "title" (Notion's required first property)
  id:               "title",
  // L1 MuscleMemory
  executionCount:   "number",
  hitCount:         "number",
  successCount:     "number",
  usageCount:       "number",
  // Shared numeric timestamps
  updatedAt:        "number",
  startedAt:        "number",
  finishedAt:       "number",
  syncedAt:         "number",
  traceCount:       "number",
  stepIndex:        "number",
  timestamp:        "number",
  candidateCount:   "number",
  committedL1:      "number",
  committedL2:      "number",
  committedL3:      "number",
  droppedCount:     "number",
};

/** Feishu → Notion numeric operator names */
const NUMBER_OP_MAP: Record<string, string> = {
  eq:  "equals",
  gt:  "greater_than",
  lt:  "less_than",
  gte: "greater_than_or_equal_to",
  lte: "less_than_or_equal_to",
};

/**
 * Notion Bitable implementation of TableOperator.
 * Uses the Notion REST API with an Integration Token (no SDK dependency).
 */
export class NotionTableOperator implements TableOperator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Shared fetch helper with auth headers and error handling. */
  private async request(method: string, endpoint: string, body?: any): Promise<any> {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        Authorization:    `Bearer ${this.apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(`Notion API Error [${res.status}]: ${err.message ?? res.statusText}`);
    }
    return res.json();
  }

  // ─── Field encoding / decoding ──────────────────────────────────────────────

  private encodeField(key: string, value: any): any {
    const type = FIELD_TYPE_MAP[key] ?? "rich_text";

    if (type === "title") {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
      return { title: [{ text: { content: text } }] };
    }

    if (type === "number") {
      return { number: typeof value === "number" ? value : Number(value ?? 0) };
    }

    // rich_text — Notion hard-caps at 2 000 chars per cell
    const text = (typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "")
    ).slice(0, 2000);
    return { rich_text: [{ text: { content: text } }] };
  }

  /** Convert Notion page properties back to a flat object our SyncWorker understands. */
  private decodeProperties(properties: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, prop] of Object.entries(properties)) {
      if (Array.isArray(prop.title)) {
        result[key] = prop.title[0]?.plain_text ?? "";
      } else if (Array.isArray(prop.rich_text)) {
        result[key] = prop.rich_text[0]?.plain_text ?? "";
      } else if (prop.number !== undefined && prop.number !== null) {
        result[key] = prop.number;
      }
    }
    return result;
  }

  // ─── Filter building ────────────────────────────────────────────────────────

  private buildSingleFilter(f: FieldFilter): any {
    const type = FIELD_TYPE_MAP[f.field] ?? "rich_text";

    if (type === "number") {
      return { property: f.field, number: { [NUMBER_OP_MAP[f.op] ?? "equals"]: f.value } };
    }
    if (type === "title") {
      return { property: f.field, title: { equals: String(f.value) } };
    }
    if (f.op === "contains") {
      return { property: f.field, rich_text: { contains: String(f.value) } };
    }
    return { property: f.field, rich_text: { equals: String(f.value) } };
  }

  private buildFilter(filters: FieldFilter[]): any {
    if (filters.length === 1) return this.buildSingleFilter(filters[0]);
    return { and: filters.map(f => this.buildSingleFilter(f)) };
  }

  // ─── TableOperator implementation ───────────────────────────────────────────

  async searchRecords(tableId: string, filters?: FieldFilter[]): Promise<{ items: any[] }> {
    const body: any = {};
    if (filters && filters.length > 0) body.filter = this.buildFilter(filters);

    const res = await this.request("POST", `/databases/${tableId}/query`, body);
    const items = (res.results ?? []).map((page: any) => ({
      record_id: page.id,
      fields:    this.decodeProperties(page.properties),
    }));
    return { items };
  }

  async createRecord(tableId: string, fields: Record<string, any>): Promise<void> {
    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        properties[key] = this.encodeField(key, value);
      }
    }
    await this.request("POST", "/pages", {
      parent:     { database_id: tableId },
      properties,
    });
  }

  async updateRecordByCustomId(tableId: string, customId: string, fields: Record<string, any>): Promise<void> {
    const res = await this.searchRecords(tableId, [{ field: "id", op: "eq", value: customId }]);
    if (!res.items || res.items.length === 0) {
      return this.createRecord(tableId, fields);
    }
    const pageId = res.items[0].record_id;
    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        properties[key] = this.encodeField(key, value);
      }
    }
    await this.request("PATCH", `/pages/${pageId}`, { properties });
  }

  async deleteRecordByCustomId(tableId: string, customId: string): Promise<void> {
    const res = await this.searchRecords(tableId, [{ field: "id", op: "eq", value: customId }]);
    if (!res.items || res.items.length === 0) return;
    const pageId = res.items[0].record_id;
    // Notion "deletes" by archiving
    await this.request("PATCH", `/pages/${pageId}`, { archived: true });
  }
}
