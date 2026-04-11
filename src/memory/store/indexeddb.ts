import { openDB, IDBPDatabase, DBSchema } from 'idb';
import {
  L1MuscleMemory,
  L2SkillMemory,
  L3TacticalMemory,
  SyncQueueEntry,
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
}

export class MemoryStore {
  private dbName = 'CoTaborMemoryDB';
  private dbVersion = 1;
  private dbPromise: Promise<IDBPDatabase<CoTaborDBSchema>>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB() {
    return openDB<CoTaborDBSchema>(this.dbName, this.dbVersion, {
      upgrade(db) {
        // L1
        const l1Store = db.createObjectStore('l1_muscle', { keyPath: 'id' });
        l1Store.createIndex('by-domain', 'domain');

        // L2
        const l2Store = db.createObjectStore('l2_skill', { keyPath: 'id' });
        l2Store.createIndex('by-skill', 'skillName');

        // L3
        db.createObjectStore('l3_tactical', { keyPath: 'id' });

        // Sync Queue
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('by-queued-at', 'queuedAt');
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
  // For L3 we'll later combine with Vector DB (Wasm), here we just store the raw data
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
    return db.put('sync_queue', entry);
  }

  async getSyncQueue(): Promise<SyncQueueEntry[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('sync_queue', 'by-queued-at');
  }

  async clearSyncQueueEntry(id: string): Promise<void> {
    const db = await this.dbPromise;
    return db.delete('sync_queue', id);
  }

  // Clear DB for tests — private to prevent accidental production use
  private async _clearAll(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('l1_muscle');
    await db.clear('l2_skill');
    await db.clear('l3_tactical');
    await db.clear('sync_queue');
  }
}

export const memoryStore = new MemoryStore();
