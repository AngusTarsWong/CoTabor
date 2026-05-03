import { MemoryItem, L1HintMeta, L3WorkflowMeta } from "../../shared/types/memory";

function trimLine(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function summarizeL1Item(item: MemoryItem): string {
  const m = item.meta as L1HintMeta;
  const parts = [
    m.domain ? `域名=${m.domain}` : "",
    m.pathPattern ? `路径=${m.pathPattern}` : "",
    m.actionType ? `动作=${m.actionType}` : "",
    trimLine(m.physicalInstruction),
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
}

function summarizeL3Item(item: MemoryItem): string {
  const m = item.meta as L3WorkflowMeta;
  const parts = [
    item.title ? `标题=${item.title}` : "",
    m.taskType ? `任务类型=${m.taskType}` : "",
    m.domainScope ? `域名=${m.domainScope}` : "",
    trimLine(m.tacticalRules),
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
}

export function buildL1PromptContext(l1Items: MemoryItem[], limit = 3): string {
  if (l1Items.length === 0) return "";
  return `[历史操作经验]\n${l1Items.slice(0, limit).map(summarizeL1Item).join("\n")}`;
}

export function buildL3PromptContext(l3Items: MemoryItem[], limit = 3): string {
  if (l3Items.length === 0) return "";
  return `[L3 任务策略经验]\n${l3Items.slice(0, limit).map(summarizeL3Item).join("\n")}`;
}

export function buildAntiPatternContext(antiPatternItems: MemoryItem[], limit = 2): string {
  if (antiPatternItems.length === 0) return "";
  const lines = antiPatternItems.slice(0, limit).map((item) => {
    const m = item.meta as L3WorkflowMeta;
    return `- ⚠️ ${trimLine(m.tacticalRules)}`;
  }).join("\n");
  return `[历史失败教训 - 执行前务必避开]\n${lines}`;
}

export function buildPlannerMemoryContext(input: {
  l1Items: MemoryItem[];
  l3Items: MemoryItem[];
  antiPatternL3Items?: MemoryItem[];
}): string {
  return [
    buildL1PromptContext(input.l1Items),
    buildL3PromptContext(input.l3Items),
    buildAntiPatternContext(input.antiPatternL3Items ?? []),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildReplannerMemoryContext(input: {
  l1Items: MemoryItem[];
  l3Items: MemoryItem[];
}): string {
  const body = buildPlannerMemoryContext(input);
  if (!body) return "";
  return `${body}\n\n[使用要求]\n如果存在页面操作经验，优先利用这些经验调整恢复动作，避免重复尝试已知容易失败的方式。`;
}

/**
 * Extract the physicalInstruction strings from L1 MemoryItems for Executor injection.
 */
export function buildExecutorL1Hints(l1Items: MemoryItem[], limit = 3): string[] {
  return l1Items
    .slice(0, limit)
    .map((item) => trimLine((item.meta as L1HintMeta).physicalInstruction))
    .filter(Boolean);
}
