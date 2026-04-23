import winkBm25 from "wink-bm25-text-search";
import { L3RetrievalMatch, L3ScoreBreakdown, L3TacticalMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";
import { preprocessL3Query } from "./l3-query-preprocessor";

type WinkBm25Engine = ReturnType<typeof winkBm25>;

interface IndexedL3Doc {
  id: string;
  memoryTitle: string;
  keywords: string;
  intentQuery: string;
  tacticalRules: string;
  domainScope: string;
  taskType: string;
  language: string;
}

export interface L3SearchOptions {
  domainScope?: string;
  taskType?: string;
  language?: string;
  limit?: number;
  /** When true, search() returns L3RetrievalMatch[] with score breakdown. Default: false. */
  returnScores?: boolean;
}

/** sessionStorage key for the serialized document cache. Versioned to allow safe invalidation. */
const SESSION_CACHE_KEY = "l3_bm25_docs_v1";

export class L3Bm25Index {
  private engine: WinkBm25Engine | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private docs = new Map<string, L3TacticalMemory>();

  private createEngine(): WinkBm25Engine {
    const engine = winkBm25();
    engine.defineConfig({
      fldWeights: {
        memoryTitle: 5,
        keywords: 4,
        intentQuery: 3,
        tacticalRules: 1,
      },
    });
    engine.definePrepTasks([
      (input: string) => preprocessL3Query({ query: input }).queryTokens,
    ]);
    return engine;
  }

  private toIndexedDoc(rule: L3TacticalMemory): IndexedL3Doc {
    return {
      id: rule.id,
      memoryTitle: rule.memoryTitle || "",
      keywords: (rule.keywords || []).join(" "),
      intentQuery: rule.intentQuery || "",
      tacticalRules: rule.tacticalRules || "",
      domainScope: rule.domainScope || "",
      taskType: rule.taskType || "",
      language: rule.language || "",
    };
  }

  /**
   * Try to restore the document set from sessionStorage.
   * Returns the documents on success, null if the cache is absent or corrupted.
   */
  private loadFromSession(): L3TacticalMemory[] | null {
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as L3TacticalMemory[];
    } catch {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
  }

  /** Serialize the current document set to sessionStorage for fast cold-start. */
  private persistToSession(): void {
    try {
      const docs = Array.from(this.docs.values());
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(docs));
    } catch {
      // Silently ignore quota errors — next cold-start will fall back to IndexedDB.
    }
  }

  /** Invalidate the sessionStorage cache so the next init reads from IndexedDB. */
  static invalidateSessionCache(): void {
    try {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
      // ignore
    }
  }

  private async doInit(records?: L3TacticalMemory[]): Promise<void> {
    // When called without explicit records (cold-start), try the session cache first.
    if (!records) {
      const cached = this.loadFromSession();
      if (cached) {
        const engine = this.createEngine();
        const docs = new Map<string, L3TacticalMemory>();
        cached.forEach((rule) => {
          engine.addDoc(this.toIndexedDoc(rule), rule.id);
          docs.set(rule.id, rule);
        });
        engine.consolidate();
        this.engine = engine;
        this.docs = docs;
        this.ready = true;
        return;
      }
    }

    const nextRecords = records ?? await memoryStore.getAllL3Rules();
    const engine = this.createEngine();
    const docs = new Map<string, L3TacticalMemory>();

    nextRecords.forEach((rule) => {
      engine.addDoc(this.toIndexedDoc(rule), rule.id);
      docs.set(rule.id, rule);
    });

    engine.consolidate();
    this.engine = engine;
    this.docs = docs;
    this.ready = true;
  }

  async ensureReady(): Promise<void> {
    if (this.ready && this.engine) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  async warmup(): Promise<void> {
    await this.ensureReady();
  }

  async rebuild(records?: L3TacticalMemory[]): Promise<void> {
    this.ready = false;
    this.engine = null;
    this.docs = new Map<string, L3TacticalMemory>();
    await this.doInit(records);
    // After any rebuild, persist the fresh document set so the next
    // sidepanel cold-start can skip the IndexedDB read.
    this.persistToSession();
  }

  // More specific overload must come first so TypeScript selects it when returnScores is present.
  async search(query: string, options: L3SearchOptions & { returnScores: true }): Promise<L3RetrievalMatch[]>;
  async search(query: string, options?: L3SearchOptions): Promise<L3TacticalMemory[]>;
  async search(query: string, options: L3SearchOptions = {}): Promise<L3TacticalMemory[] | L3RetrievalMatch[]> {
    await this.ensureReady();
    if (!this.engine) return [];

    const preprocessed = preprocessL3Query({
      query,
      domainScope: options.domainScope,
      taskType: options.taskType,
    });
    const limit = options.limit ?? 5;
    const rawResults = this.engine.search(preprocessed.normalizedQuery, Math.max(limit * 6, limit * 3));

    const reranked = rawResults
      .map(([id, bm25Score]) => {
        const rule = this.docs.get(String(id));
        if (!rule) return null;

        const domainBonus = (options.domainScope && rule.domainScope && options.domainScope === rule.domainScope) ? 3 : 0;
        const taskTypeBonus = (options.taskType && rule.taskType && options.taskType === rule.taskType) ? 2 : 0;
        const languageBonus = (options.language && rule.language && options.language === rule.language) ? 1 : 0;
        const successBonus = Math.min((rule.successCount || 0) * 0.2, 2);
        const usageBonus = Math.min((rule.usageCount || 0) * 0.1, 1.5);
        const freshnessBonus = (Date.now() - rule.updatedAt) < 1000 * 60 * 60 * 24 * 14 ? 0.8 : 0;

        const scoreBreakdown: L3ScoreBreakdown = {
          bm25: bm25Score,
          domainBonus,
          taskTypeBonus,
          languageBonus,
          successBonus,
          usageBonus,
          freshnessBonus,
        };

        return {
          rule,
          score: bm25Score + domainBonus + taskTypeBonus + languageBonus + successBonus + usageBonus + freshnessBonus,
          scoreBreakdown,
        };
      })
      .filter((item): item is { rule: L3TacticalMemory; score: number; scoreBreakdown: L3ScoreBreakdown } => !!item)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (options.returnScores) {
      return reranked.map((item): L3RetrievalMatch => ({
        memory: item.rule,
        score: item.score,
        scoreBreakdown: item.scoreBreakdown,
      }));
    }

    return reranked.map((item) => item.rule);
  }
}

export const l3Bm25Index = new L3Bm25Index();
