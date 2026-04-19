import winkBm25 from "wink-bm25-text-search";
import { L1MuscleMemory } from "../../shared/types/memory";
import { tokenizeText } from "./tokenize";

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
  engine.definePrepTasks([
    (input: string) => tokenizeText(input || ""),
  ]);
  return engine;
}

function toIndexedDoc(rule: L1MuscleMemory): IndexedL1Doc {
  return {
    id: rule.id,
    physicalInstruction: normalizeInstruction(rule.physicalInstruction),
    actionType: rule.actionType || "",
    pathPattern: rule.pathPattern || "",
    elementSelector: rule.elementSelector || "",
    reason: rule.reason || "",
  };
}

function scoreRule(rule: L1MuscleMemory, bm25Score: number, currentPath: string): number {
  let finalScore = bm25Score;

  if (currentPath && rule.pathPattern) {
    if (rule.pathPattern === currentPath) finalScore += 4;
    else if (currentPath.includes(rule.pathPattern.replace(/[\^\$\.\*\+\?\(\)\[\]\{\}\\]/g, ""))) finalScore += 1.5;
  }

  const successRate = rule.executionCount > 0 ? rule.successCount / rule.executionCount : 0;
  finalScore += Math.min(rule.executionCount * 0.1, 1.5);
  finalScore += successRate * 2;
  return finalScore;
}

export function selectRelevantL1Hints(input: {
  l1Rules: L1MuscleMemory[];
  intent?: string;
  currentUrl?: string;
  fallbackHints?: string[];
  limit?: number;
}): string[] {
  const { l1Rules, intent = "", currentUrl, fallbackHints = [], limit = 3 } = input;
  if (l1Rules.length === 0) return fallbackHints.slice(0, limit);

  const normalizedIntent = intent.trim();
  if (!normalizedIntent) {
    return l1Rules
      .slice(0, limit)
      .map((rule) => normalizeInstruction(rule.physicalInstruction))
      .filter(Boolean);
  }

  let currentPath = "";
  try {
    currentPath = currentUrl ? new URL(currentUrl).pathname : "";
  } catch {
    currentPath = "";
  }

  const engine = createEngine();
  const docs = new Map<string, L1MuscleMemory>();
  l1Rules.forEach((rule) => {
    engine.addDoc(toIndexedDoc(rule), rule.id);
    docs.set(rule.id, rule);
  });
  engine.consolidate();

  const results = engine.search(normalizedIntent, Math.max(limit * 4, 6));
  const ranked = results
    .map(([id, score]) => {
      const rule = docs.get(String(id));
      if (!rule) return null;
      return {
        rule,
        score: scoreRule(rule, score, currentPath),
      };
    })
    .filter((item): item is { rule: L1MuscleMemory; score: number } => !!item)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => normalizeInstruction(item.rule.physicalInstruction))
    .filter(Boolean);

  if (ranked.length > 0) return ranked;
  return fallbackHints.slice(0, limit);
}
