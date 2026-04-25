import { openDB, IDBPDatabase, DBSchema } from 'idb';
import {
  L1MuscleMemory,
  L2SkillMemory,
  L3TacticalMemory,
  MemoryAttributionRecord,
  MemoryEdge,
  MemoryRelation,
  RawTraceRecord,
  SyncQueueEntry,
  TaskRunRecord,
} from '../../shared/types/memory';

interface CoTaborDBSchema extends DBSchema {
  l1_muscle: {
    key: string; // rule ID
    value: L1MuscleMemory;
    // We'll create indexes to search quickly
    indexes: {
      'by-domain': string;
    };
  };
  l2_skill: {
    key: string;
    value: L2SkillMemory;
    indexes: {
      'by-skill': string;
      'by-skill-context': [string, string];
    };
  };
  l3_tactical: {
    key: string;
    value: L3TacticalMemory;
  };
  sync_queue: {
    key: string;
    value: SyncQueueEntry;
    indexes: {
      'by-queued-at': number;
    };
  };
  raw_trace: {
    key: string;
    value: RawTraceRecord;
    indexes: {
      'by-task-run': string;
      'by-timestamp': number;
    };
  };
  task_run: {
    key: string;
    value: TaskRunRecord;
    indexes: {
      'by-cloud-status': string;
      'by-experience-status': string;
      'by-updated-at': number;
    };
  };
  memory_attribution: {
    key: string;
    value: MemoryAttributionRecord;
    indexes: {
      'by-task-run': string;
    };
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

export class MemoryStore {
  private dbName = 'CoTaborMemoryDB';
  private dbVersion = 6;
  private dbPromise: Promise<IDBPDatabase<CoTaborDBSchema>>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB() {
    return openDB<CoTaborDBSchema>(this.dbName, this.dbVersion, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // L1
        if (!db.objectStoreNames.contains('l1_muscle')) {
          const l1Store = db.createObjectStore('l1_muscle', { keyPath: 'id' });
          l1Store.createIndex('by-domain', 'domain');
        }

        // L2
        if (!db.objectStoreNames.contains('l2_skill')) {
          const l2Store = db.createObjectStore('l2_skill', { keyPath: 'id' });
          l2Store.createIndex('by-skill', 'skillName');
          l2Store.createIndex('by-skill-context', ['skillName', 'contextScope']);
        } else if (oldVersion < 4) {
          // Migration: add composite index to the existing l2_skill store
          const l2Store = transaction.objectStore('l2_skill');
          if (!l2Store.indexNames.contains('by-skill-context')) {
            l2Store.createIndex('by-skill-context', ['skillName', 'contextScope']);
          }
        }

        // L3
        if (!db.objectStoreNames.contains('l3_tactical')) {
          db.createObjectStore('l3_tactical', { keyPath: 'id' });
        }

        // Sync Queue
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('by-queued-at', 'queuedAt');
        }

        if (!db.objectStoreNames.contains('raw_trace')) {
          const traceStore = db.createObjectStore('raw_trace', { keyPath: 'traceId' });
          traceStore.createIndex('by-task-run', 'taskRunId');
          traceStore.createIndex('by-timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('task_run')) {
          const taskRunStore = db.createObjectStore('task_run', { keyPath: 'id' });
          taskRunStore.createIndex('by-cloud-status', 'cloudSyncStatus');
          taskRunStore.createIndex('by-experience-status', 'experienceStatus');
          taskRunStore.createIndex('by-updated-at', 'updatedAt');
        } else {
          const taskRunStore = transaction.objectStore('task_run');
          if (!taskRunStore.indexNames.contains('by-cloud-status')) {
            taskRunStore.createIndex('by-cloud-status', 'cloudSyncStatus');
          }
          if (!taskRunStore.indexNames.contains('by-experience-status')) {
            taskRunStore.createIndex('by-experience-status', 'experienceStatus');
          }
          if (!taskRunStore.indexNames.contains('by-updated-at')) {
            taskRunStore.createIndex('by-updated-at', 'updatedAt');
          }
        }

        // v5: Memory attribution store for quality-loop tracking
        if (!db.objectStoreNames.contains('memory_attribution')) {
          const attrStore = db.createObjectStore('memory_attribution', { keyPath: 'id' });
          attrStore.createIndex('by-task-run', 'taskRunId');
        }

        // v6: Knowledge graph edges between L3 memories
        if (!db.objectStoreNames.contains('memory_edges')) {
          const edgeStore = db.createObjectStore('memory_edges', { keyPath: 'id' });
          edgeStore.createIndex('by-source', 'sourceId');
          edgeStore.createIndex('by-target', 'targetId');
        }
      },
    });
  }

  // --- L1 Methods ---
  async getL1RulesByDomain(domain: string): Promise<L1MuscleMemory[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('l1_muscle', 'by-domain', domain);
  }

  async putL1Rule(rule: L1MuscleMemory): Promise<string> {
    const db = await this.dbPromise;
    return db.put('l1_muscle', rule);
  }

  // --- L2 Methods ---

  /** Returns the first matching L2 rule for a skill (legacy single-rule lookup). */
  async getL2RuleBySkill(skillName: string): Promise<L2SkillMemory | undefined> {
    const db = await this.dbPromise;
    const rules = await db.getAllFromIndex('l2_skill', 'by-skill', skillName);
    return rules.length > 0 ? rules[0] : undefined;
  }

  /**
   * Returns all L2 rules for a skill, optionally filtered by contextScope.
   * When contextScope is provided, uses the composite index for an exact match.
   * Falls back to all rules for the skill when contextScope is omitted.
   */
  async getL2RulesBySkillAndContext(
    skillName: string,
    contextScope?: string
  ): Promise<L2SkillMemory[]> {
    const db = await this.dbPromise;
    if (contextScope !== undefined) {
      return db.getAllFromIndex('l2_skill', 'by-skill-context', [skillName, contextScope]);
    }
    return db.getAllFromIndex('l2_skill', 'by-skill', skillName);
  }

  async putL2Rule(rule: L2SkillMemory): Promise<string> {
    const db = await this.dbPromise;
    return db.put('l2_skill', rule);
  }

  // --- L3 Methods ---
  // L3 uses IndexedDB as the single source of truth; BM25 index is rebuilt from these records.
  async getAllL3Rules(): Promise<L3TacticalMemory[]> {
    const db = await this.dbPromise;
    return db.getAll('l3_tactical');
  }

  async putL3Rule(rule: L3TacticalMemory): Promise<string> {
    const db = await this.dbPromise;
    return db.put('l3_tactical', rule);
  }

  async getL3Rule(id: string): Promise<L3TacticalMemory | undefined> {
    const db = await this.dbPromise;
    return db.get('l3_tactical', id);
  }

  // --- Ebbinghaus stability update (fire-and-forget friendly) ---

  /**
   * Increment Ebbinghaus stability for a retrieved memory record and stamp lastAccessedAt.
   * Designed to be called fire-and-forget after retrieval to avoid blocking the caller.
   * Silently no-ops if the record no longer exists.
   */
  async updateMemoryStability(
    level: 'L1' | 'L2' | 'L3',
    id: string,
    newStability: number,
  ): Promise<void> {
    const db = await this.dbPromise;
    const now = Date.now();

    if (level === 'L1') {
      const record = await db.get('l1_muscle', id);
      if (record) {
        await db.put('l1_muscle', { ...record, stability: newStability, lastAccessedAt: now });
      }
    } else if (level === 'L2') {
      const record = await db.get('l2_skill', id);
      if (record) {
        await db.put('l2_skill', { ...record, stability: newStability, lastAccessedAt: now });
      }
    } else {
      const record = await db.get('l3_tactical', id);
      if (record) {
        await db.put('l3_tactical', { ...record, stability: newStability, lastAccessedAt: now });
      }
    }
  }

  // --- Sync Queue Methods ---
  async enqueueSync(entry: SyncQueueEntry): Promise<string> {
    const db = await this.dbPromise;
    return db.put('sync_queue', {
      ...entry,
      status: entry.status || 'pending',
    });
  }

  async getSyncQueue(): Promise<SyncQueueEntry[]> {
    const db = await this.dbPromise;
    const entries = await db.getAllFromIndex('sync_queue', 'by-queued-at');
    return entries.filter((entry) => entry.status !== 'failed');
  }

  async getAllSyncQueueEntries(): Promise<SyncQueueEntry[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('sync_queue', 'by-queued-at');
  }

  async clearSyncQueueEntry(id: string): Promise<void> {
    const db = await this.dbPromise;
    return db.delete('sync_queue', id);
  }

  // --- Raw Trace Methods ---
  async putRawTrace(trace: RawTraceRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('raw_trace', trace);
  }

  async putRawTraces(traces: RawTraceRecord[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('raw_trace', 'readwrite');
    for (const trace of traces) {
      await tx.store.put(trace);
    }
    await tx.done;
  }

  async getRawTracesByTaskRun(taskRunId: string): Promise<RawTraceRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('raw_trace', 'by-task-run', taskRunId);
  }

  // --- Task Run Methods ---
  async putTaskRun(taskRun: TaskRunRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('task_run', taskRun);
  }

  async getTaskRun(taskRunId: string): Promise<TaskRunRecord | undefined> {
    const db = await this.dbPromise;
    return db.get('task_run', taskRunId);
  }

  async getExperienceTaskRunsByStatus(status: TaskRunRecord['experienceStatus']): Promise<TaskRunRecord[]> {
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

  // --- Memory Attribution Methods ---
  async putAttribution(record: MemoryAttributionRecord): Promise<string> {
    const db = await this.dbPromise;
    return db.put('memory_attribution', record);
  }

  async getAttributionsByTaskRun(taskRunId: string): Promise<MemoryAttributionRecord[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('memory_attribution', 'by-task-run', taskRunId);
  }

  // --- Knowledge Graph Edge Methods ---

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

  /** Returns all edges touching the given memory (as source OR target). */
  async getEdgesForMemory(memoryId: string): Promise<MemoryEdge[]> {
    const [asSource, asTarget] = await Promise.all([
      this.getEdgesBySource(memoryId),
      this.getEdgesByTarget(memoryId),
    ]);
    const seen = new Set<string>();
    return [...asSource, ...asTarget].filter(e => {
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

  /**
   * Upsert a co-occurrence edge between two memories.
   * If the edge already exists its weight and count are incremented; otherwise it is created.
   */
  async upsertCoOccurrenceEdge(idA: string, idB: string): Promise<void> {
    if (idA === idB) return;
    const existing = await this.getEdge(idA, idB);
    const now = Date.now();
    const [minId, maxId] = [idA, idB].sort();

    if (existing) {
      const newCount = existing.coOccurrenceCount + 1;
      const newWeight = Math.min(newCount * 0.1 + 0.3, 1.0);
      await this.putEdge({
        ...existing,
        coOccurrenceCount: newCount,
        weight: newWeight,
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

  /** Back-fills taskOutcome for all attribution records belonging to a task run. */
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

  // Clear DB for tests — private to prevent accidental production use
  private async _clearAll(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('l1_muscle');
    await db.clear('l2_skill');
    await db.clear('l3_tactical');
    await db.clear('sync_queue');
    await db.clear('raw_trace');
    await db.clear('task_run');
    await db.clear('memory_attribution');
    await db.clear('memory_edges');
  }
}

export const memoryStore = new MemoryStore();
