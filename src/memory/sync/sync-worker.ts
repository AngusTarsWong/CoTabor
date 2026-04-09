import { memoryStore } from "../store/indexeddb";
import { l3VectorStore } from "../rag/vector-store";
import { SyncQueueEntry, L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from "../../shared/types/memory";
import { TableOperator, TableConfig } from "../../shared/types/operator";

export class SyncWorker {
  private api: TableOperator;
  private config: TableConfig;
  private isPushing = false;
  private isPulling = false;

  constructor(api: TableOperator, config: TableConfig) {
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
    if (level === "L3" && fields.embedding) {
      fields.embedding = JSON.stringify(fields.embedding);
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
    if (level === "L3" && payload.embedding && typeof payload.embedding === "string") {
      try { payload.embedding = JSON.parse(payload.embedding); } catch (e) {}
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

        try {
          if (task.action === "insert") {
            await this.api.createRecord(tableId, fields);
          } else if (task.action === "update") {
            await this.api.updateRecordByCustomId(tableId, task.targetId, fields);
          } else if (task.action === "delete") {
            // Delete logic omitted for brevity, but easily supported
            console.log(`[SyncWorker] Delete action for ${task.targetId} is not implemented in Feishu sync yet.`);
          }

          // If success, remove from queue
          await memoryStore.clearSyncQueueEntry(task.id);
          console.log(`[SyncWorker] Successfully pushed task: ${task.id}`);

        } catch (error) {
          console.error(`[SyncWorker] Failed to push task ${task.id}:`, error);
          // If network error, it stays in the queue to retry later
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

      for (const level of ["L1", "L2", "L3"] as const) {
        const tableId = this.getTableId(level);
        // Ask Feishu for records modified after our last pull
        // We use Bitable filter logic. We assume the table has an 'updatedAt' column (Unix ms)
        const res = await this.api.searchRecords(tableId, {
          conjunction: "and",
          conditions: [
            { field_name: "updatedAt", operator: "isGreater", value: [lastPullTimestamp.toString()] }
          ]
        });

        if (res.items && res.items.length > 0) {
          console.log(`[SyncWorker] Found ${res.items.length} remote updates for ${level}`);
          
          for (const item of res.items) {
            const payload = this.mapFieldsToPayload(item.fields, level);
            
            // Write to local IndexedDB (Last Write Wins)
            if (level === "L1") await memoryStore.putL1Rule(payload as L1MuscleMemory);
            if (level === "L2") await memoryStore.putL2Rule(payload as L2SkillMemory);
            if (level === "L3") {
              await memoryStore.putL3Rule(payload as L3TacticalMemory);
              hasL3Updates = true;
            }
          }
        }
      }

      // If L3 was modified from the cloud, reload the local Orama Vector DB
      if (hasL3Updates) {
        const allL3 = await memoryStore.getAllL3Rules();
        await l3VectorStore.init(allL3);
        console.log(`[SyncWorker] Reloaded L3 Vector DB with new cloud rules.`);
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
