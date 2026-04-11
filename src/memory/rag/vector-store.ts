import { create, insert, search, Orama } from '@orama/orama';
import { L3TacticalMemory } from '../../shared/types/memory';

/**
 * L3 Vector Store using Orama.
 * Orama is an ultra-lightweight (~20KB) in-memory vector/hybrid search engine 
 * designed perfectly for Edge/Browser environments.
 */
export class L3VectorStore {
  // Use any to bypass Orama complex generic type inferencing here, but it's fully typed below
  private db: Orama<any> | null = null;

  /**
   * Initialize the Orama DB instance with existing L3 records from IndexedDB.
   */
  async init(records: L3TacticalMemory[]) {
    // 1. Create the DB schema
    // Note: We use 2048 dimensions matching Volcengine doubao-embedding-vision
    this.db = await create({
      schema: {
        id: 'string',
        intentQuery: 'string',
        tacticalRules: 'string',
        embedding: 'vector[2048]',
      },
    });

    // 2. Load existing records (e.g. from IndexedDB) into memory
    for (const record of records) {
      if (record.embedding && record.embedding.length === 2048) {
        await insert(this.db, {
          id: record.id,
          intentQuery: record.intentQuery,
          tacticalRules: record.tacticalRules,
          embedding: record.embedding,
        });
      }
    }
  }

  /**
   * Add a new L3 tactical memory record into the current active memory index.
   */
  async addRecord(record: L3TacticalMemory) {
    if (!this.db) throw new Error('Orama Vector DB is not initialized. Call init() first.');
    if (!record.embedding || record.embedding.length !== 2048) {
      throw new Error('Invalid or missing 2048-dim embedding vector');
    }
    
    await insert(this.db, {
      id: record.id,
      intentQuery: record.intentQuery,
      tacticalRules: record.tacticalRules,
      embedding: record.embedding,
    });
  }

  /**
   * Perform pure vector similarity search (Cosine Similarity).
   * Orama handles the math efficiently in memory.
   */
  async searchSimilar(queryVector: number[], limit: number = 5): Promise<L3TacticalMemory[]> {
    if (!this.db) throw new Error('Orama Vector DB is not initialized.');
    if (queryVector.length !== 2048) throw new Error('Query vector must be 2048-dimensional.');

    const results = await search(this.db, {
      mode: 'vector',
      vector: {
        value: queryVector as any, // Orama type workaround for array numbers
        property: 'embedding',
      },
      similarity: 0.1, // Minimum similarity threshold
      limit,
    } as any);

    // Map Orama hit format back to our L3 interface
    return results.hits.map(hit => ({
      id: hit.document.id as string,
      intentQuery: hit.document.intentQuery as string,
      tacticalRules: hit.document.tacticalRules as string,
      updatedAt: Date.now(), // Dynamic field, just placeholder for return
    } as L3TacticalMemory));
  }
}

// Export singleton instance
export const l3VectorStore = new L3VectorStore();
