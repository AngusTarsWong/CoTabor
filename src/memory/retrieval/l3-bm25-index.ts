import winkBm25 from "wink-bm25-text-search";
import { L3TacticalMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";
import { preprocessL3Query } from "./l3-query-preprocessor";

type WinkBm25Engine = ReturnType<typeof winkBm25>;

interface IndexedL3Doc {
  id: string;
  title: string;
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
}

export class L3Bm25Index {
  private engine: WinkBm25Engine | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private docs = new Map<string, L3TacticalMemory>();

  private createEngine(): WinkBm25Engine {
    const engine = winkBm25();
    engine.defineConfig({
      fldWeights: {
        title: 5,
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
      title: rule.title || "",
      keywords: (rule.keywords || []).join(" "),
      intentQuery: rule.intentQuery || "",
      tacticalRules: rule.tacticalRules || "",
      domainScope: rule.domainScope || "",
      taskType: rule.taskType || "",
      language: rule.language || "",
    };
  }

  private async doInit(records?: L3TacticalMemory[]): Promise<void> {
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
  }

  async search(query: string, options: L3SearchOptions = {}): Promise<L3TacticalMemory[]> {
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
      .map(([id, score]) => {
        const rule = this.docs.get(String(id));
        if (!rule) return null;

        let finalScore = score;
        if (options.domainScope && rule.domainScope && options.domainScope === rule.domainScope) {
          finalScore += 3;
        }
        if (options.taskType && rule.taskType && options.taskType === rule.taskType) {
          finalScore += 2;
        }
        if (options.language && rule.language && options.language === rule.language) {
          finalScore += 1;
        }

        finalScore += Math.min((rule.successCount || 0) * 0.2, 2);
        finalScore += Math.min((rule.usageCount || 0) * 0.1, 1.5);
        finalScore += Math.min((Date.now() - rule.updatedAt) < 1000 * 60 * 60 * 24 * 14 ? 0.8 : 0, 0.8);

        return { rule, score: finalScore };
      })
      .filter((item): item is { rule: L3TacticalMemory; score: number } => !!item)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.rule);

    return reranked;
  }
}

export const l3Bm25Index = new L3Bm25Index();

