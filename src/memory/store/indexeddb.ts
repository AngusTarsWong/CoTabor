import { openDB, IDBPDatabase, DBSchema } from 'idb';
import {
  MemoryItem,
  MemoryAttributionRecord,
  MemoryEdge,
  MemoryRelation,
  RawTraceRecord,
  SyncQueueEntry,
  TaskRunRecord,
} from '../../shared/types/memory';

// ─────────────────────────────────────────────────────────────────────────────
// DB Schema — v8: unified agent_memory_nodes table.
// Legacy l1_muscle / l2_skill / l3_tactical tables removed.
// ─────────────────────────────────────────────────────────────────────────────
interface CoTaborDBSchema extends DBSchema {
  agent_memory_nodes: {
    key: string;
    value: MemoryItem;
    indexes: {
      'by-type': string;
      'by-tag': string;        // multiEntry
      'by-updated-at': number;
    };
  };
  sync_queue: {
    key: string;
    value: SyncQueueEntry;
    indexes: { 'by-queued-at': number };
  };
  raw_trace: {
    key: string;
    value: RawTraceRecord;
    indexes: {
      'by-task-run': string;
      'by-dag-run': string;
      'by-timestamp': number;
    };
  };
  task_run: {
    key: string;
    value: TaskRunRecord;
    indexes: {
      'by-cloud-status': string;
      'by-dag-run': string;
      'by-experience-status': string;
      'by-updated-at': number;
    };
  };
  memory_attribution: {
    key: string;
    value: MemoryAttributionRecord;
    indexes: { 'by-task-run': string };
  };
  memory_edges: {
    key: string;
    value: MemoryEdge;
    indexes: {
      'by-source': string;
      'by-target': string;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MemoryStore
// ─────────────────────────────────────────────────────────────────────────────
export class MemoryStore {
  private dbName = 'CoTaborMemoryDB';
  private dbVersion = 8;
  private dbPromise: Promise<IDBPDatabase<CoTaborDBSchema>>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB() {
    return openDB<CoTaborDBSchema>(this.dbName, this.dbVersion, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('agent_memory_nodes')) {
          const store = db.createObjectStore('agent_memory_nodes', { keyPath: 'id' });
          store.createIndex('by-type', 'type');
          store.createIndex('by-tag', 'tags', { multiEntry: true });
          store.createIndex('by-updated-at', 'updatedAt');
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const s = db.createObjectStore('sync_queue', { keyPath: 'id' });
          s.createIndex('by-queued-at', 'queuedAt');
        }

        if (!db.objectStoreNames.contains('raw_trace')) {
          const s = db.createObjectStore('raw_trace', { keyPath: 'traceId' });
          s.createIndex('by-task-run', 'taskRunId');
          s.createIndex('by-dag-run', 'dagRunId');
          s.createIndex('by-timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('task_run')) {
          const s = db.createObjectStore('task_run', { keyPath: 'id' });
          s.createIndex('by-cloud-status', 'cloudSyncStatus');
          s.createIndex('by-dag-run', 'dagRunId');
          s.createIndex('by-experience-status', 'experienceStatus');
          s.createIndex('by-updated-at', 'updatedAt');
        }

        if (!db.objectStoreNames.contains('memory_attribution')) {
          const s = db.createObjectStore('memory_attribution', { keyPath: 'id' });
          s.createIndex('by-task-run', 'taskRunId');
        }

        if (!db.objectStoreNames.contains('memory_edges')) {
          const s = db.createObjectStore('memory_edges', { keyPath: 'id' });
          s.createIndex('by-source', 'sourceId');
          s.createIndex('by-target', 'targetId');
        }
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // agent_memory_nodes — Unified CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async putMemoryItem(item: MemoryItem): Promise<string> {
    const db = await this.dbPromise;
    return db.put('agent_memory_nodes', item);
  }

  async getMemoryItem(id: string): Promise<MemoryItem | undefined> {
    const db = await this.dbPromise;
    return db.get('agent_memory_nodes', id);
  }

  async getMemoryItemsByType(type: MemoryItem['type']): Promise<MemoryItem[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('agent_memory_nodes', 'by-type', type);
  }

  async getMemoryItemsByTags(tags: string[]): Promise<MemoryItem[]> {
    if (tags.length === 0) return [];
    const db = await this.dbPromise;
    const resultMap = new Map<string, MemoryItem>();
    for (const tag of tags) {
      const items = await db.getAllFromIndex('agent_memory_nodes', 'by-tag', tag);
      for (const item of items) resultMap.set(item.id, item);
    }
    return Array.from(resultMap.values());
  }

  async getAllMemoryItems(): Promise<MemoryItem[]> {
    const db = await this.dbPromise;
    return db.getAll('agent_memory_nodes');
  }

  async deleteMemoryItem(id: string): Promise<void> {
    const db = await this.dbPromise;
    return db.delete('agent_memory_nodes', id);
  }

  async updateMemoryItemStability(id: string, newStability: number): Promise<void> {
    const db = await this.dbPromise;
    const record = await db.get('agent_memory_nodes', id);
    if (record) {
      await db.put('agent_memory_nodes', {
        ...record,
        stability: newStability,
        lastAccessedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sync Queue
  // ═══════════════════════════════════════════════════════════════════════════

  async enqueueSync(entry: SyncQueueEntry): Promise<string> {
    const db = await this.dbPromise;
    return db.put('sync_queue', { ...entry, status: entry.status || 'pending' });
  }

  async getSyncQueue(): Promise<SyncQueueEntry[]> {
    const db = await this.dbPromise;
    const entries = await db.getAllFromIndex('sync_queue', 'by-queued-at');
    return entries.filter((e) => e.status !== 'failed');
  }

  async getAllSyncQueueEntries(): Promise<SyncQueueEntry[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('sync_queue', 'by-queued-at');
  }

  async clearSyncQueueEntry(id: string): Promise<void> {
    const db = await this.dbPromise;
    return db.delete('sync_queue', id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Raw Trace
  // ═══════════════════════════════════════════════════════════════════════════

  async putRawTrace(trace: RawTraceRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('raw_trace', trace);
  }

  async putRawTraces(traces: RawTraceRecord[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('raw_trace', 'readwrite');
    for (const trace of traces) await tx.store.put(trace);
    await tx.done;
  }

  async getRawTracesByTaskRun(taskRunId: string): Promise<RawTraceRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('raw_trace', 'by-task-run', taskRunId);
  }

  async getRawTracesByDagRun(dagRunId: string): Promise<RawTraceRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('raw_trace', 'by-dag-run', dagRunId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Task Run
  // ═══════════════════════════════════════════════════════════════════════════

  async putTaskRun(taskRun: TaskRunRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('task_run', taskRun);
  }

  async getTaskRun(taskRunId: string): Promise<TaskRunRecord | undefined> {
    const db = await this.dbPromise;
    return db.get('task_run', taskRunId);
  }

  async getTaskRunsByDagRun(dagRunId: string): Promise<TaskRunRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('task_run', 'by-dag-run', dagRunId);
  }

  async getExperienceTaskRunsByStatus(
    status: TaskRunRecord['experienceStatus'],
  ): Promise<TaskRunRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('task_run', 'by-experience-status', status);
  }

  async getPendingExperienceTaskRuns(): Promise<TaskRunRecord[]> {
    const db = await this.dbPromise;
    const [pending, failed] = await Promise.all([
      db.getAllFromIndex('task_run', 'by-experience-status', 'PENDING'),
      db.getAllFromIndex('task_run', 'by-experience-status', 'FAILED'),
    ]);
    return [...pending, ...failed].sort((a, b) => a.updatedAt - b.updatedAt);
  }

  async getPendingTaskRuns(): Promise<TaskRunRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('task_run', 'by-cloud-status', 'pending');
  }

  async getUnsyncedTaskRuns(): Promise<TaskRunRecord[]> {
    const db = await this.dbPromise;
    const [pending, failed] = await Promise.all([
      db.getAllFromIndex('task_run', 'by-cloud-status', 'pending'),
      db.getAllFromIndex('task_run', 'by-cloud-status', 'failed'),
    ]);
    return [...pending, ...failed].sort((a, b) => a.updatedAt - b.updatedAt);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Memory Attribution
  // ═══════════════════════════════════════════════════════════════════════════

  async putAttribution(record: MemoryAttributionRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('memory_attribution', record);
  }

  async getAttributionsByTaskRun(taskRunId: string): Promise<MemoryAttributionRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('memory_attribution', 'by-task-run', taskRunId);
  }

  async updateAttributionOutcome(
    taskRunId: string,
    outcome: 'FINISHED' | 'FAILED',
  ): Promise<void> {
    const db = await this.dbPromise;
    const records = await db.getAllFromIndex('memory_attribution', 'by-task-run', taskRunId);
    if (records.length === 0) return;
    const tx = db.transaction('memory_attribution', 'readwrite');
    for (const record of records) {
      await tx.store.put({ ...record, taskOutcome: outcome });
    }
    await tx.done;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Knowledge Graph Edges
  // ═══════════════════════════════════════════════════════════════════════════

  async putEdge(edge: MemoryEdge): Promise<string> {
    const db = await this.dbPromise;
    return db.put('memory_edges', edge);
  }

  async getEdgesBySource(sourceId: string): Promise<MemoryEdge[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('memory_edges', 'by-source', sourceId);
  }

  async getEdgesByTarget(targetId: string): Promise<MemoryEdge[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('memory_edges', 'by-target', targetId);
  }

  async getEdgesForMemory(memoryId: string): Promise<MemoryEdge[]> {
    const [asSource, asTarget] = await Promise.all([
      this.getEdgesBySource(memoryId),
      this.getEdgesByTarget(memoryId),
    ]);
    const seen = new Set<string>();
    return [...asSource, ...asTarget].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  async getEdge(sourceId: string, targetId: string): Promise<MemoryEdge | undefined> {
    const db = await this.dbPromise;
    const [a, b] = [sourceId, targetId].sort();
    return db.get('memory_edges', `edge_${a}_${b}`);
  }

  async upsertCoOccurrenceEdge(idA: string, idB: string): Promise<void> {
    if (idA === idB) return;
    const existing = await this.getEdge(idA, idB);
    const now = Date.now();
    const [minId, maxId] = [idA, idB].sort();
    if (existing) {
      const newCount = existing.coOccurrenceCount + 1;
      await this.putEdge({
        ...existing,
        coOccurrenceCount: newCount,
        weight: Math.min(newCount * 0.1 + 0.3, 1.0),
        updatedAt: now,
      });
    } else {
      await this.putEdge({
        id: `edge_${minId}_${maxId}`,
        sourceId: minId,
        targetId: maxId,
        relation: 'co_occurs' as MemoryRelation,
        weight: 0.4,
        coOccurrenceCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Test helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** @internal — for unit tests only */
  async _clearAll(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('agent_memory_nodes');
    await db.clear('sync_queue');
    await db.clear('raw_trace');
    await db.clear('task_run');
    await db.clear('memory_attribution');
    await db.clear('memory_edges');
  }
}

export const memoryStore = new MemoryStore();
