import winkBm25 from "wink-bm25-text-search";
import { MemoryItem, L3RetrievalMatch, L3ScoreBreakdown, L3WorkflowMeta } from "../../shared/types/memory";
import { memoryProvider } from "../store/memory-provider";
import { preprocessL3Query } from "./l3-query-preprocessor";
import { computeRetention } from "./heat";

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
  returnScores?: boolean;
}

const SESSION_CACHE_KEY = "l3_bm25_docs_v2";

export class L3Bm25Index {
  private engine: WinkBm25Engine | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private docs = new Map<string, MemoryItem>();

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

  private getMeta(item: MemoryItem): L3WorkflowMeta {
    return item.meta as L3WorkflowMeta;
  }

  private toIndexedDoc(item: MemoryItem): IndexedL3Doc {
    const m = this.getMeta(item);
    return {
      id: item.id,
      memoryTitle: item.title || "",
      keywords: (m.keywords || []).join(" "),
      intentQuery: m.intentQuery || "",
      tacticalRules: m.tacticalRules || "",
      domainScope: m.domainScope || "",
      taskType: m.taskType || "",
      language: m.language || "",
    };
  }

  private scoreItem(item: MemoryItem, bm25Score: number, options: L3SearchOptions): L3RetrievalMatch {
    const m = this.getMeta(item);
    const domainBonus = (options.domainScope && m.domainScope && options.domainScope === m.domainScope) ? 3 : 0;
    const taskTypeBonus = (options.taskType && m.taskType && options.taskType === m.taskType) ? 2 : 0;
    const languageBonus = (options.language && m.language && options.language === m.language) ? 1 : 0;
    const successBonus = Math.min((m.successCount || 0) * 0.2, 2);
    const usageBonus = Math.min((m.usageCount || 0) * 0.1, 1.5);
    const retentionBonus = computeRetention(item) * 1.6;

    const scoreBreakdown: L3ScoreBreakdown = {
      bm25: bm25Score,
      domainBonus,
      taskTypeBonus,
      languageBonus,
      successBonus,
      usageBonus,
      retentionBonus,
    };

    return {
      memory: item,
      score: bm25Score + domainBonus + taskTypeBonus + languageBonus + successBonus + usageBonus + retentionBonus,
      scoreBreakdown,
    };
  }

  private searchSmallCollection(queryTokens: string[], options: L3SearchOptions): L3RetrievalMatch[] {
    const limit = options.limit ?? 5;
    const uniqueQueryTokens = new Set(queryTokens);
    const queryTokenCount = Math.max(uniqueQueryTokens.size, 1);

    return Array.from(this.docs.values())
      .map((item) => {
        const doc = this.toIndexedDoc(item);
        const docTokens = new Set(preprocessL3Query({
          query: `${doc.memoryTitle} ${doc.keywords} ${doc.intentQuery} ${doc.tacticalRules}`,
        }).queryTokens);
        let overlap = 0;
        uniqueQueryTokens.forEach((token) => { if (docTokens.has(token)) overlap += 1; });
        return this.scoreItem(item, overlap / queryTokenCount, options);
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private loadFromSession(): MemoryItem[] | null {
    if (typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as MemoryItem[];
    } catch {
      try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* ignore */ }
      return null;
    }
  }

  private persistToSession(): void {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(Array.from(this.docs.values())));
    } catch { /* ignore quota errors */ }
  }

  static invalidateSessionCache(): void {
    if (typeof sessionStorage === "undefined") return;
    try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* ignore */ }
  }

  private async doInit(records?: MemoryItem[]): Promise<void> {
    if (!records) {
      const cached = this.loadFromSession();
      if (cached) {
        const engine = this.createEngine();
        const docs = new Map<string, MemoryItem>();
        cached.forEach((item) => { docs.set(item.id, item); });
        if (cached.length >= 3) {
          cached.forEach((item) => { engine.addDoc(this.toIndexedDoc(item), item.id); });
          engine.consolidate();
        }
        this.engine = engine;
        this.docs = docs;
        this.ready = true;
        return;
      }
    }

    const nextRecords = records ?? await memoryProvider.getAll('L3_WORKFLOW');
    const engine = this.createEngine();
    const docs = new Map<string, MemoryItem>();

    if (nextRecords.length < 3) {
      nextRecords.forEach((item) => { docs.set(item.id, item); });
      this.engine = engine;
      this.docs = docs;
      this.ready = true;
      return;
    }

    nextRecords.forEach((item) => {
      engine.addDoc(this.toIndexedDoc(item), item.id);
      docs.set(item.id, item);
    });

    engine.consolidate();
    this.engine = engine;
    this.docs = docs;
    this.ready = true;
  }

  async ensureReady(): Promise<void> {
    if (this.ready && this.engine) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit().finally(() => { this.initPromise = null; });
    return this.initPromise;
  }

  async warmup(): Promise<void> {
    await this.ensureReady();
  }

  async rebuild(records?: MemoryItem[]): Promise<void> {
    this.ready = false;
    this.engine = null;
    this.docs = new Map<string, MemoryItem>();
    await this.doInit(records);
    this.persistToSession();
  }

  async search(query: string, options: L3SearchOptions & { returnScores: true }): Promise<L3RetrievalMatch[]>;
  async search(query: string, options?: L3SearchOptions): Promise<MemoryItem[]>;
  async search(query: string, options: L3SearchOptions = {}): Promise<MemoryItem[] | L3RetrievalMatch[]> {
    await this.ensureReady();
    if (!this.engine || this.docs.size === 0) return [];

    const preprocessed = preprocessL3Query({
      query,
      domainScope: options.domainScope,
      taskType: options.taskType,
    });
    const limit = options.limit ?? 5;

    if (this.docs.size < 3) {
      const smallResults = this.searchSmallCollection(preprocessed.queryTokens, options);
      return options.returnScores ? smallResults : smallResults.map((r) => r.memory);
    }

    const rawResults = this.engine.search(preprocessed.normalizedQuery, Math.max(limit * 6, limit * 3));

    const reranked = rawResults
      .map(([id, bm25Score]) => {
        const item = this.docs.get(String(id));
        if (!item) return null;
        return this.scoreItem(item, bm25Score, options);
      })
      .filter((r): r is L3RetrievalMatch => !!r)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return options.returnScores ? reranked : reranked.map((r) => r.memory);
  }
}

export const l3Bm25Index = new L3Bm25Index();
