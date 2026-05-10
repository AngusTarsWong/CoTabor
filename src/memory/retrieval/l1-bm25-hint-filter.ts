import { MemoryItem, L1HintMeta } from "../../shared/types/memory";
import { tokenizeText } from "./tokenize";
import winkBm25 from "wink-bm25-text-search";
import { shouldUseSmallCollectionFallback } from "./bm25-policy";

type WinkBm25Engine = ReturnType<typeof winkBm25>;

interface IndexedL1Doc {
  id: string;
  physicalInstruction: string;
  actionType: string;
  pathPattern: string;
  elementSelector: string;
  reason: string;
}

function normalizeInstruction(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function createEngine(): WinkBm25Engine {
  const engine = winkBm25();
  engine.defineConfig({
    fldWeights: {
      physicalInstruction: 5,
      actionType: 3,
      reason: 2,
      pathPattern: 1,
      elementSelector: 1,
    },
  });
  engine.definePrepTasks([(input: string) => tokenizeText(input || "")]);
  return engine;
}

function toIndexedDoc(item: MemoryItem): IndexedL1Doc {
  const m = item.meta as L1HintMeta;
  return {
    id: item.id,
    physicalInstruction: normalizeInstruction(m.physicalInstruction),
    actionType: m.actionType || "",
    pathPattern: m.pathPattern || "",
    elementSelector: m.elementSelector || "",
    reason: m.reason || "",
  };
}

function scoreItem(item: MemoryItem, bm25Score: number, currentPath: string): number {
  const m = item.meta as L1HintMeta;
  let finalScore = bm25Score;

  if (currentPath && m.pathPattern) {
    if (m.pathPattern === currentPath) finalScore += 4;
    else if (currentPath.includes(m.pathPattern.replace(/[\^$.*+?()[\]{}\\]/g, ""))) finalScore += 1.5;
  }

  const successRate = m.executionCount > 0 ? m.successCount / m.executionCount : 0;
  finalScore += Math.min(m.executionCount * 0.1, 1.5);
  finalScore += successRate * 2;
  return finalScore;
}

function scoreSmallCollection(
  l1Items: MemoryItem[],
  normalizedIntent: string,
  currentPath: string,
  limit: number,
): string[] {
  const queryTokens = new Set(tokenizeText(normalizedIntent));
  const queryTokenCount = Math.max(queryTokens.size, 1);

  return l1Items
    .map((item) => {
      const indexed = toIndexedDoc(item);
      const docTokens = new Set(tokenizeText([
        indexed.physicalInstruction,
        indexed.actionType,
        indexed.pathPattern,
        indexed.elementSelector,
        indexed.reason,
      ].join(" ")));

      let overlap = 0;
      queryTokens.forEach((token) => {
        if (docTokens.has(token)) overlap += 1;
      });

      return {
        item,
        score: scoreItem(item, overlap / queryTokenCount, currentPath),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => normalizeInstruction((entry.item.meta as L1HintMeta).physicalInstruction))
    .filter(Boolean);
}

/**
 * Filter a list of L1 MemoryItems to find the most relevant ones for a given intent.
 * Returns the physicalInstruction strings ready to be injected into the executor prompt.
 */
export function selectRelevantL1Hints(input: {
  l1Items: MemoryItem[];
  intent?: string;
  currentUrl?: string;
  fallbackHints?: string[];
  limit?: number;
}): string[] {
  const { l1Items, intent = "", currentUrl, fallbackHints = [], limit = 3 } = input;
  if (l1Items.length === 0) return fallbackHints.slice(0, limit);

  const normalizedIntent = intent.trim();
  if (!normalizedIntent) {
    return l1Items
      .slice(0, limit)
      .map((item) => normalizeInstruction((item.meta as L1HintMeta).physicalInstruction))
      .filter(Boolean);
  }

  let currentPath = "";
  try { currentPath = currentUrl ? new URL(currentUrl).pathname : ""; } catch { /**/ }

  if (shouldUseSmallCollectionFallback(l1Items.length)) {
    const ranked = scoreSmallCollection(l1Items, normalizedIntent, currentPath, limit);
    return ranked.length > 0 ? ranked : fallbackHints.slice(0, limit);
  }

  const engine = createEngine();
  const docs = new Map<string, MemoryItem>();
  l1Items.forEach((item) => {
    engine.addDoc(toIndexedDoc(item), item.id);
    docs.set(item.id, item);
  });
  engine.consolidate();

  const results = engine.search(normalizedIntent, Math.max(limit * 4, 6));
  const ranked = results
    .map(([id, score]) => {
      const item = docs.get(String(id));
      if (!item) return null;
      return { item, score: scoreItem(item, score, currentPath) };
    })
    .filter((r): r is { item: MemoryItem; score: number } => !!r)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => normalizeInstruction((r.item.meta as L1HintMeta).physicalInstruction))
    .filter(Boolean);

  return ranked.length > 0 ? ranked : fallbackHints.slice(0, limit);
}
