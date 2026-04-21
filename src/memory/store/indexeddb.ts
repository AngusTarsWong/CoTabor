import { openDB, IDBPDatabase, DBSchema } from 'idb';
import {
  L1MuscleMemory,
  L2SkillMemory,
  L3TacticalMemory,
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
}

export class MemoryStore {
  private dbName = 'CoTaborMemoryDB';
  private dbVersion = 3;
  private dbPromise: Promise<IDBPDatabase<CoTaborDBSchema>>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB() {
    return openDB<CoTaborDBSchema>(this.dbName, this.dbVersion, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        // L1
        if (!db.objectStoreNames.contains('l1_muscle')) {
          const l1Store = db.createObjectStore('l1_muscle', { keyPath: 'id' });
          l1Store.createIndex('by-domain', 'domain');
        }

        // L2
        if (!db.objectStoreNames.contains('l2_skill')) {
          const l2Store = db.createObjectStore('l2_skill', { keyPath: 'id' });
          l2Store.createIndex('by-skill', 'skillName');
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
  async getL2RuleBySkill(skillName: string): Promise<L2SkillMemory | undefined> {
    const db = await this.dbPromise;
    const rules = await db.getAllFromIndex('l2_skill', 'by-skill', skillName);
    return rules.length > 0 ? rules[0] : undefined; // Assume 1 rule per skill
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

  // Clear DB for tests — private to prevent accidental production use
  private async _clearAll(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('l1_muscle');
    await db.clear('l2_skill');
    await db.clear('l3_tactical');
    await db.clear('sync_queue');
    await db.clear('raw_trace');
    await db.clear('task_run');
  }
}

export const memoryStore = new MemoryStore();
