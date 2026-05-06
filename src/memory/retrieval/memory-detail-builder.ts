import {
  L1HintMeta,
  L2RuleMeta,
  L3WorkflowMeta,
  MemoryItem,
  NodeMemoryDetailItem,
  NodeMemoryDetails,
} from "../../shared/types/memory";
import type { NodeMemoryUsage } from "./memory-usage-builder";
import type { RetrievedMemoriesPayload } from "./retrieve-and-assemble-memories";

function normalizeText(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function summarize(value: string, limit = 140): string {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

function sourceMeta(item: MemoryItem): Record<string, unknown> {
  return item.meta as unknown as Record<string, unknown>;
}

function buildL1InjectedText(item: MemoryItem): string {
  const meta = item.meta as L1HintMeta;
  const parts = [
    meta.domain ? `域名=${meta.domain}` : "",
    meta.pathPattern ? `路径=${meta.pathPattern}` : "",
    meta.actionType ? `动作=${meta.actionType}` : "",
    normalizeText(meta.physicalInstruction),
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildL1Detail(item: MemoryItem, injectionSurface: string): NodeMemoryDetailItem {
  const meta = item.meta as L1HintMeta;
  const injectedText = buildL1InjectedText(item);
  const fullText = normalizeText(meta.physicalInstruction || item.content);
  return {
    id: item.id,
    level: "L1",
    title: item.title || "页面操作经验",
    summary: summarize(fullText || injectedText),
    fullText: fullText || injectedText,
    injectedText,
    injectionSurface,
    sourceMeta: sourceMeta(item),
  };
}

function buildL2InjectedText(item: MemoryItem): string {
  const meta = item.meta as L2RuleMeta;
  const scope = meta.contextScope || meta.ruleScope || "通用";
  return `${meta.skillName}: [${scope}] ${normalizeText(meta.parameterRules || item.content)}`;
}

function buildL2Detail(item: MemoryItem, injectionSurface: string): NodeMemoryDetailItem {
  const meta = item.meta as L2RuleMeta;
  const fullText = normalizeText(meta.parameterRules || item.content);
  const title = item.title || `${meta.skillName} 工具调用经验`;
  return {
    id: item.id,
    level: "L2",
    title,
    summary: summarize(fullText),
    fullText,
    injectedText: buildL2InjectedText(item),
    injectionSurface,
    sourceMeta: sourceMeta(item),
  };
}

function buildSyntheticL2Detail(rule: string, index: number): NodeMemoryDetailItem {
  const text = normalizeText(rule);
  return {
    id: `l2_rule_${index}`,
    level: "L2",
    title: text.split(":")[0] || "工具调用经验",
    summary: summarize(text),
    fullText: text,
    injectedText: text,
    injectionSurface: "available_skills",
  };
}

function buildL3InjectedText(item: MemoryItem): string {
  const meta = item.meta as L3WorkflowMeta;
  const parts = [
    item.title ? `标题=${item.title}` : "",
    meta.taskType ? `任务类型=${meta.taskType}` : "",
    meta.domainScope ? `域名=${meta.domainScope}` : "",
    normalizeText(meta.tacticalRules || item.content),
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildL3Detail(item: MemoryItem, injectionSurface: string): NodeMemoryDetailItem {
  const meta = item.meta as L3WorkflowMeta;
  const fullText = normalizeText(meta.tacticalRules || item.content);
  return {
    id: item.id,
    level: "L3",
    title: item.title || (meta.memoryType === "anti_pattern" ? "失败教训" : "任务策略经验"),
    summary: summarize(fullText),
    fullText,
    injectedText: meta.memoryType === "anti_pattern"
      ? `[反模式] ${fullText}`
      : buildL3InjectedText(item),
    injectionSurface,
    sourceMeta: sourceMeta(item),
    memoryType: meta.memoryType ?? "positive",
  };
}

function findL1ItemForHint(
  l1Items: MemoryItem[],
  hint: string,
  usedIds: Set<string>,
): MemoryItem | null {
  const normalizedHint = normalizeText(hint);
  return l1Items.find((item) => {
    if (usedIds.has(item.id)) return false;
    const meta = item.meta as L1HintMeta;
    return normalizeText(meta.physicalInstruction) === normalizedHint;
  }) ?? null;
}

export function buildPlannerNodeMemoryDetails(input: {
  memories: Partial<RetrievedMemoriesPayload>;
  refresh?: NodeMemoryUsage["refresh"];
}): NodeMemoryDetails {
  const l2Items = input.memories.l2Items || [];
  const items: NodeMemoryDetailItem[] = [
    ...(input.memories.l1Items || []).map((item) => buildL1Detail(item, "l1OperationalExperience")),
    ...(l2Items.length > 0
      ? l2Items.map((item) => buildL2Detail(item, "available_skills"))
      : (input.memories.l2Rules || []).map((rule, index) => buildSyntheticL2Detail(rule, index))),
    ...(input.memories.l3Items || []).map((item) => buildL3Detail(item, "retrievedMemoryContext")),
    ...(input.memories.antiPatternL3Items || []).map((item) => buildL3Detail(item, "retrievedMemoryContext")),
  ];

  return {
    consumer: "planner",
    refresh: input.refresh,
    items,
  };
}

export function buildExecutorNodeMemoryDetails(input: {
  l1Items: MemoryItem[];
  selectedHints: string[];
  refresh?: NodeMemoryUsage["refresh"];
}): NodeMemoryDetails {
  const usedIds = new Set<string>();
  const items = input.selectedHints.map<NodeMemoryDetailItem>((hint, index) => {
    const matched = findL1ItemForHint(input.l1Items, hint, usedIds);
    if (matched) {
      usedIds.add(matched.id);
      return buildL1Detail(matched, "HybridUIExecutor L1 hints");
    }

    const text = normalizeText(hint);
    return {
      id: `executor_l1_hint_${index}`,
      level: "L1",
      title: "页面操作经验",
      summary: summarize(text),
      fullText: text,
      injectedText: text,
      injectionSurface: "HybridUIExecutor L1 hints",
    };
  });

  return {
    consumer: "executor",
    refresh: input.refresh,
    items,
  };
}
