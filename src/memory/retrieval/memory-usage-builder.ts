import { L1MuscleMemory } from "../../shared/types/memory";
import { L2RulePair } from "./l2-rule-retriever";
import { selectRelevantL1Hints } from "./l1-bm25-hint-filter";

export interface NodeMemoryUsage {
  count: number;
  l1: string[];
  l2: string[];
  l3: string[];
}

function extractSectionItems(context?: string, sectionTitle?: string): string[] {
  if (!context || !sectionTitle) return [];
  const lines = context.split("\n");
  const marker = `[${sectionTitle}]`;
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) return [];

  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("[")) break;
    if (line.startsWith("- ")) items.push(line.slice(2).trim());
  }
  return items;
}

function buildNodeMemoryUsage(input: {
  l1?: string[];
  l2?: string[];
  l3?: string[];
}): NodeMemoryUsage {
  const l1 = input.l1 || [];
  const l2 = input.l2 || [];
  const l3 = input.l3 || [];
  return {
    count: l1.length + l2.length + l3.length,
    l1,
    l2,
    l3,
  };
}

export function summarizeL2Rules(l2RuleMap: Map<string, L2RulePair>): string[] {
  return [...l2RuleMap.entries()]
    .map(([skillName, pair]) => {
      const parts: string[] = [];
      const baseContent = (pair.base?.parameterRules || "").replace(/\s+/g, " ").trim();
      const ctxContent = (pair.contextual?.parameterRules || "").replace(/\s+/g, " ").trim();
      if (baseContent) parts.push(`[通用] ${baseContent}`);
      if (ctxContent) parts.push(`[${pair.contextual?.contextScope ?? "场景"}] ${ctxContent}`);
      if (parts.length === 0) return "";
      return `${skillName}: ${parts.join(" / ")}`;
    })
    .filter(Boolean);
}

export function buildMemoryNodeUsage(input: {
  plannerContext?: string;
  l2Rules?: string[];
}): NodeMemoryUsage {
  return buildNodeMemoryUsage({
    l1: extractSectionItems(input.plannerContext, "L1 页面操作经验"),
    l2: input.l2Rules || [],
    l3: extractSectionItems(input.plannerContext, "L3 任务策略经验"),
  });
}

export function buildPlannerNodeUsage(input: {
  plannerContext?: string;
  l2Rules?: string[];
}): NodeMemoryUsage {
  return buildMemoryNodeUsage(input);
}

export function buildReplannerNodeUsage(input: {
  replannerContext?: string;
  l2Rules?: string[];
}): NodeMemoryUsage {
  return buildNodeMemoryUsage({
    l1: extractSectionItems(input.replannerContext, "L1 页面操作经验"),
    l2: input.l2Rules || [],
    l3: extractSectionItems(input.replannerContext, "L3 任务策略经验"),
  });
}

export function buildExecutorNodeUsage(input: {
  l1Rules: L1MuscleMemory[];
  intent?: string;
  currentUrl?: string;
  fallbackHints?: string[];
  limit?: number;
}): NodeMemoryUsage {
  const l1 = selectRelevantL1Hints({
    l1Rules: input.l1Rules,
    intent: input.intent,
    currentUrl: input.currentUrl,
    fallbackHints: input.fallbackHints,
    limit: input.limit ?? 3,
  });
  return buildNodeMemoryUsage({ l1 });
}
