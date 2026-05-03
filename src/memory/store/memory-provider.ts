/**
 * MemoryProvider — the single interface through which all business logic
 * (graph nodes, distiller, retrievers) interacts with memory storage.
 */

import {
  MemoryItem,
  MemoryItemType,
} from '../../shared/types/memory';
import { memoryStore } from './indexeddb';

// ─────────────────────────────────────────────────────────────────────────────
// Search options
// ─────────────────────────────────────────────────────────────────────────────

export interface MemorySearchOptions {
  type?: MemoryItemType;
  /** Hard-filter: return items that have AT LEAST ONE of these tags. */
  anyTags?: string[];
  /** Hard-filter: only return items that have ALL of these tags. */
  requiredTags?: string[];
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMemoryProvider interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IMemoryProvider {
  search(options: MemorySearchOptions): Promise<MemoryItem[]>;
  get(id: string): Promise<MemoryItem | undefined>;
  save(item: MemoryItem): Promise<void>;
  delete(id: string): Promise<void>;
  /** Grow Ebbinghaus stability. Fire-and-forget friendly. */
  touchStability(id: string, newStability: number): Promise<void>;
  getAll(type?: MemoryItemType): Promise<MemoryItem[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDBMemoryProvider — concrete implementation
// ─────────────────────────────────────────────────────────────────────────────

class IndexedDBMemoryProvider implements IMemoryProvider {

  async search(options: MemorySearchOptions): Promise<MemoryItem[]> {
    const { type, anyTags = [], requiredTags = [], limit = 10 } = options;

    let candidates: MemoryItem[];

    if (type) {
      candidates = await memoryStore.getMemoryItemsByType(type);
    } else if (anyTags.length > 0) {
      candidates = await memoryStore.getMemoryItemsByTags(anyTags);
    } else {
      candidates = await memoryStore.getAllMemoryItems();
    }

    if (requiredTags.length > 0) {
      const required = new Set(requiredTags);
      candidates = candidates.filter((item) =>
        item.tags.some((t) => required.has(t)),
      );
    }

    return candidates.slice(0, limit);
  }

  async get(id: string): Promise<MemoryItem | undefined> {
    return memoryStore.getMemoryItem(id);
  }

  async save(item: MemoryItem): Promise<void> {
    await memoryStore.putMemoryItem(item);
  }

  async delete(id: string): Promise<void> {
    await memoryStore.deleteMemoryItem(id);
  }

  async touchStability(id: string, newStability: number): Promise<void> {
    await memoryStore.updateMemoryItemStability(id, newStability);
  }

  async getAll(type?: MemoryItemType): Promise<MemoryItem[]> {
    if (type) return memoryStore.getMemoryItemsByType(type);
    return memoryStore.getAllMemoryItems();
  }
}

export const memoryProvider: IMemoryProvider = new IndexedDBMemoryProvider();

// ─────────────────────────────────────────────────────────────────────────────
// ID generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateMemoryId(type: MemoryItemType): string {
  const prefix = type === 'L1_HINT' ? 'hint' : type === 'L2_RULE' ? 'rule' : 'wf';
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
