import { memoryStore } from "../store/indexeddb";
import { l3Bm25Index } from "../retrieval/l3-bm25-index";
import { SyncQueueEntry, L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from "../../shared/types/memory";
import { TableOperator, SyncConfig } from "../../shared/types/operator";

export class SyncWorker {
  private api: TableOperator;
  private config: SyncConfig;
  private isPushing = false;
  private isPulling = false;

  constructor(api: TableOperator, config: SyncConfig) {
    this.api = api;
    this.config = config;
  }

  /**
   * Determine the table ID based on memory level
   */
  private getTableId(level: "L1" | "L2" | "L3"): string {
    return this.config.tableIds[level];
  }

  /**
   * Helper to format our DB object to Feishu Bitable Fields.
   * Feishu fields require specific mapping. For simplicity, we map our keys 1:1 to Feishu Column Names.
   */
  private mapPayloadToFields(payload: any, level: "L1" | "L2" | "L3"): Record<string, any> {
    const fields = { ...payload };
    // Bitable doesn't easily store Arrays/Objects unless it's a specific column type,
    // so we stringify complex types.
    if (level === "L3" && Array.isArray(fields.keywords)) {
      fields.keywords = JSON.stringify(fields.keywords);
    }
    if (level === "L3" && fields.title && !fields.memoryTitle) {
      fields.memoryTitle = fields.title;
      delete fields.title;
    }
    if (level === "L1" && typeof fields.physicalInstruction !== "string") {
      fields.physicalInstruction = JSON.stringify(fields.physicalInstruction);
    }
    return fields;
  }

  /**
   * Helper to format Feishu Bitable Fields back to our DB object.
   */
  private mapFieldsToPayload(fields: any, level: "L1" | "L2" | "L3"): any {
    const payload = { ...fields };
    if (level === "L3" && payload.keywords && typeof payload.keywords === "string") {
      try { payload.keywords = JSON.parse(payload.keywords); } catch (e) {}
    }
    if (level === "L3" && payload.title && !payload.memoryTitle) {
      payload.memoryTitle = payload.title;
      delete payload.title;
    }
    if (level === "L1" && payload.physicalInstruction && typeof payload.physicalInstruction === "string") {
      try { payload.physicalInstruction = JSON.parse(payload.physicalInstruction); } catch (e) {}
    }
    return payload;
  }

  /**
   * Push Local changes (SyncQueue) to Feishu Cloud
   */
  async pushQueueToCloud(): Promise<void> {
    if (this.isPushing) return;
    this.isPushing = true;

    try {
      const queue = await memoryStore.getSyncQueue();
      if (queue.length === 0) return;

      console.log(`[SyncWorker] Starting push of ${queue.length} tasks to Feishu...`);

      for (const task of queue) {
        const tableId = this.getTableId(task.memoryLevel);
        const fields = this.mapPayloadToFields(task.payload, task.memoryLevel);
        const now = Date.now();

        try {
          if (task.action === "insert") {
            await this.api.createRecord(tableId, fields);
          } else if (task.action === "update") {
            await this.api.updateRecordByCustomId(tableId, task.targetId, fields);
          } else if (task.action === "delete") {
            await this.api.deleteRecordByCustomId(tableId, task.targetId);
          }

          // If success, remove from queue
          await memoryStore.clearSyncQueueEntry(task.id);
          console.log(`[SyncWorker] Successfully pushed task: ${task.id}`);

        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[SyncWorker] Failed to push task ${task.id}:`, error);
          // Increment retry count; drop the task after 3 consecutive failures
          const retryCount = (task.retryCount || 0) + 1;
          if (retryCount >= 3) {
            await memoryStore.enqueueSync({
              ...task,
              retryCount,
              status: "failed",
              lastError: message,
              lastAttemptAt: now,
            });
            console.error(`[SyncWorker] Task ${task.id} permanently failed after ${retryCount} retries.`);
          } else {
            await memoryStore.enqueueSync({
              ...task,
              retryCount,
              status: "pending",
              lastError: message,
              lastAttemptAt: now,
            });
          }
        }
      }
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Pull Cloud changes (Feishu) down to Local Edge Cache
   */
  async pullCloudToEdge(lastPullTimestamp: number): Promise<number> {
    if (this.isPulling) return lastPullTimestamp;
    this.isPulling = true;

    const newTimestamp = Date.now();
    let hasL3Updates = false;

    try {
      console.log(`[SyncWorker] Pulling changes from Feishu since ${new Date(lastPullTimestamp).toISOString()}`);

      // Build a set of targetIds that have local pending writes; skip overwriting them
      const syncQueue = await memoryStore.getSyncQueue();
      const pendingTargetIds = new Set(syncQueue.map(e => e.targetId));

      for (const level of ["L1", "L2", "L3"] as const) {
        const tableId = this.getTableId(level);
        // Ask Feishu for records modified after our last pull.
        // Requires 'updatedAt' column (Unix ms) to exist in each table.
        const res = await this.api.searchRecords(tableId, [
          { field: 'updatedAt', op: 'gt', value: lastPullTimestamp },
        ]);

        if (res.items && res.items.length > 0) {
          console.log(`[SyncWorker] Found ${res.items.length} remote updates for ${level}`);

          for (const item of res.items) {
            const payload = this.mapFieldsToPayload(item.fields, level);

            // Skip records that have un-pushed local changes to avoid overwriting them
            if (pendingTargetIds.has(payload.id)) {
              console.log(`[SyncWorker] Skipping remote update for ${payload.id}: local pending write exists.`);
              continue;
            }

            if (level === "L1") await memoryStore.putL1Rule(payload as L1MuscleMemory);
            if (level === "L2") await memoryStore.putL2Rule(payload as L2SkillMemory);
            if (level === "L3") {
              await memoryStore.putL3Rule(payload as L3TacticalMemory);
              hasL3Updates = true;
            }
          }
        }
      }

      if (hasL3Updates) {
        const allL3 = await memoryStore.getAllL3Rules();
        await l3Bm25Index.rebuild(allL3);
        console.log(`[SyncWorker] Reloaded L3 BM25 index with new cloud rules.`);
      }

      return newTimestamp;
    } catch (error) {
      console.error(`[SyncWorker] Failed to pull from cloud:`, error);
      return lastPullTimestamp; // Retry next time
    } finally {
      this.isPulling = false;
    }
  }
}
