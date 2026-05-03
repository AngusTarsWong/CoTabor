/** Normalized filter condition used by both Feishu and Notion operators. */
export interface FieldFilter {
  field: string;
  op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: any;
}

/** Backend-agnostic CRUD interface for memory table operations. */
export interface TableOperator {
  searchRecords(tableId: string, filters?: FieldFilter[]): Promise<{ items: any[] }>;
  createRecord(tableId: string, fields: Record<string, any>): Promise<void>;
  updateRecordByCustomId(tableId: string, customId: string, fields: Record<string, any>): Promise<void>;
  deleteRecordByCustomId(tableId: string, customId: string): Promise<void>;
}

/** Minimal config SyncWorker needs — just the L1/L2/L3 table IDs. */
export interface SyncConfig {
  tableIds: { L1: string; L2: string; L3: string };
  taskTableIds?: { TaskRuns?: string; RawTraces?: string };
}

export type SyncBackendType = 'feishu' | 'notion';

export interface SyncWorkerConfig extends SyncConfig {
  backendType: SyncBackendType;
}

/**
 * Legacy Feishu-specific config kept for FeishuTableOperator constructor
 * and backward-compatible chrome.storage.local reads.
 */
export interface TableConfig {
  appId: string;
  appSecret: string;
  appToken: string;
  tableIds: { L1: string; L2: string; L3: string };
  taskTableIds?: { TaskRuns?: string; RawTraces?: string };
}

// ─── Persisted backend configs ────────────────────────────────────────────────

export interface FeishuBackendConfig extends SyncConfig {
  type: 'feishu';
  memoriesAppToken: string;
  logsAppToken?: string;
  logsTableIds?: Record<string, string>;
}

export interface NotionBackendConfig extends SyncConfig {
  type: 'notion';
  // tableIds.L1/L2/L3 are Notion Database IDs
}

export type StorageBackendConfig = FeishuBackendConfig | NotionBackendConfig;
