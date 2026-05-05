import { memoryProvider } from "../store/memory-provider";
import { memoryStore } from "../store/indexeddb";
import { l3Bm25Index } from "../retrieval/l3-bm25-index";
import { MemoryItem, L3WorkflowMeta, SyncQueueEntry } from "../../shared/types/memory";
import { TableOperator, SyncWorkerConfig } from "../../shared/types/operator";

export class SyncWorker {
  private api: TableOperator;
  private config: SyncWorkerConfig;
  private isPushing = false;
  private isPulling = false;

  constructor(api: TableOperator, config: SyncWorkerConfig) {
    this.api = api;
    this.config = config;
  }

  private get providerLabel(): string {
    return "Notion";
  }

  private getTableId(level: "L1" | "L2" | "L3"): string {
    return this.config.tableIds[level];
  }

  /**
   * Map a MemoryItem to the cloud table field format.
   * L3 keyword arrays are JSON-stringified for backends that don't support arrays.
   */
  private mapItemToFields(item: MemoryItem, level: "L1" | "L2" | "L3"): Record<string, any> {
    // Only include fields that exist in the Notion database schema for each level.
    // Sending unknown fields causes Notion API 400 errors.
    const shared = {
      id: item.id,
      stability: item.stability,
      lastAccessedAt: item.lastAccessedAt,
      updatedAt: item.updatedAt,
    };

    if (level === "L1") {
      const m = item.meta as import("../../shared/types/memory").L1HintMeta;
      return {
        ...shared,
        domain: m.domain,
        pathPattern: m.pathPattern,
        elementSelector: m.elementSelector,
        actionType: m.actionType,
        physicalInstruction: m.physicalInstruction,
        reason: m.reason,
        executionCount: m.executionCount,
        successCount: m.successCount,
      };
    }

    if (level === "L2") {
      const m = item.meta as import("../../shared/types/memory").L2RuleMeta;
      return {
        ...shared,
        skillName: m.skillName,
        ruleType: m.ruleType,
        contextScope: m.contextScope,
        ruleScope: m.ruleScope,
        parameterRules: m.parameterRules,
        errorHistory: m.errorHistory,
        hitCount: m.hitCount,
        successCount: m.successCount,
        status: (m as any).status || "active",
      };
    }

    // L3
    const m = item.meta as import("../../shared/types/memory").L3WorkflowMeta;
    return {
      ...shared,
      memoryTitle: item.title,
      intentQuery: m.intentQuery,
      taskType: m.taskType,
      domainScope: m.domainScope,
      language: m.language,
      keywords: Array.isArray(m.keywords) ? JSON.stringify(m.keywords) : (m.keywords ?? ""),
      tacticalRules: m.tacticalRules,
      usageCount: m.usageCount,
      successCount: m.successCount,
      relatedMemoryIds: JSON.stringify(m.relatedMemoryIds ?? []),
      memoryType: m.memoryType,
    };
  }

  /**
   * Reconstruct a MemoryItem from cloud table fields.
   */
  private mapFieldsToItem(fields: any, level: "L1" | "L2" | "L3"): MemoryItem {
    const base: Omit<MemoryItem, "meta"> = {
      id: fields.id,
      // type/content/title/tags are not stored in Notion — derive them from level and meta fields.
      type: level === "L1" ? "L1_HINT" : level === "L2" ? "L2_RULE" : "L3_WORKFLOW",
      content: fields.physicalInstruction || fields.parameterRules || fields.tacticalRules || fields.content || "",
      title: fields.memoryTitle || fields.title || fields.id || "",
      tags: this.parseJsonField(fields.tags, fields.domain ? [`domain:${fields.domain}`] : []),
      stability: fields.stability ?? 2,
      lastAccessedAt: fields.lastAccessedAt ?? Date.now(),
      createdAt: fields.createdAt ?? Date.now(),
      updatedAt: fields.updatedAt ?? Date.now(),
    };

    if (level === "L1") {
      return { ...base, meta: {
        domain: fields.domain || "", pathPattern: fields.pathPattern || "",
        elementSelector: fields.elementSelector || "", actionType: fields.actionType || "",
        executionCount: fields.executionCount ?? 0, successCount: fields.successCount ?? 0,
        physicalInstruction: fields.physicalInstruction || "", reason: fields.reason,
      }};
    }
    if (level === "L2") {
      return { ...base, meta: {
        skillName: fields.skillName || "", ruleType: fields.ruleType, contextScope: fields.contextScope,
        ruleScope: fields.ruleScope, parameterRules: fields.parameterRules || "",
        errorHistory: fields.errorHistory, hitCount: fields.hitCount, successCount: fields.successCount,
        status: fields.status || "active",
      }};
    }
    // L3
    const keywords = typeof fields.keywords === "string"
      ? this.parseJsonField(fields.keywords, [])
      : (fields.keywords || []);
    return { ...base, meta: {
      intentQuery: fields.intentQuery || "", taskType: fields.taskType, domainScope: fields.domainScope,
      language: fields.language, keywords, tacticalRules: fields.tacticalRules || "",
      usageCount: fields.usageCount, successCount: fields.successCount,
      relatedMemoryIds: this.parseJsonField(fields.relatedMemoryIds, []),
      memoryType: fields.memoryType,
    } as L3WorkflowMeta};
  }

  private parseJsonField<T>(value: any, fallback: T): T {
    if (!value) return fallback;
    if (typeof value !== "string") return value as T;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }

  async pushQueueToCloud(): Promise<void> {
    if (this.isPushing) return;
    this.isPushing = true;
    try {
      const queue = await memoryStore.getSyncQueue();
      if (queue.length === 0) return;
      console.log(`[SyncWorker] Pushing ${queue.length} tasks to ${this.providerLabel}...`);

      for (const task of queue) {
        const tableId = this.getTableId(task.memoryLevel);
        const item = task.payload as MemoryItem;
        const fields = this.mapItemToFields(item, task.memoryLevel);
        const now = Date.now();
        try {
          if (task.action === "insert") await this.api.createRecord(tableId, fields);
          else if (task.action === "update") await this.api.updateRecordByCustomId(tableId, task.targetId, fields);
          else if (task.action === "delete") await this.api.deleteRecordByCustomId(tableId, task.targetId);
          await memoryStore.clearSyncQueueEntry(task.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[SyncWorker] Failed to push ${task.id}:`, error);
          const retryCount = (task.retryCount || 0) + 1;
          const updatedTask: SyncQueueEntry = {
            ...task, retryCount,
            status: retryCount >= 3 ? "failed" : "pending",
            lastError: message, lastAttemptAt: now,
          };
          await memoryStore.enqueueSync(updatedTask);
        }
      }
    } finally {
      this.isPushing = false;
    }
  }

  async pullCloudToEdge(lastPullTimestamp: number): Promise<number> {
    if (this.isPulling) return lastPullTimestamp;
    this.isPulling = true;
    const newTimestamp = Date.now();
    let hasL3Updates = false;

    try {
      console.log(`[SyncWorker] Pulling from ${this.providerLabel} since ${new Date(lastPullTimestamp).toISOString()}`);
      const syncQueue = await memoryStore.getSyncQueue();
      const pendingTargetIds = new Set(syncQueue.map((e) => e.targetId));

      for (const level of ["L1", "L2", "L3"] as const) {
        const tableId = this.getTableId(level);
        // When lastPullTimestamp is 0 (full sync), skip the date filter to avoid
        // Notion API errors with epoch-0 date values.
        const filters = lastPullTimestamp > 0
          ? [{ field: "updatedAt", op: "gt" as const, value: lastPullTimestamp }]
          : undefined;
        const res = await this.api.searchRecords(tableId, filters);

        if (res.items && res.items.length > 0) {
          console.log(`[SyncWorker] ${res.items.length} remote updates for ${level}`);
          for (const cloudRecord of res.items) {
            const item = this.mapFieldsToItem(cloudRecord.fields, level);
            if (pendingTargetIds.has(item.id)) {
              console.log(`[SyncWorker] Skipping ${item.id}: local pending write exists.`);
              continue;
            }
            await memoryProvider.save(item);
            if (level === "L3") hasL3Updates = true;
          }
        }
      }

      if (hasL3Updates) {
        const allL3 = await memoryProvider.getAll("L3_WORKFLOW");
        await l3Bm25Index.rebuild(allL3);
        console.log(`[SyncWorker] Reloaded L3 BM25 index.`);
      }

      return newTimestamp;
    } catch (error) {
      console.error(`[SyncWorker] Pull failed:`, error);
      return lastPullTimestamp;
    } finally {
      this.isPulling = false;
    }
  }
}
