import { L1MuscleMemory, L3TacticalMemory } from "../../shared/types/memory";

function trimLine(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function summarizeL1Rule(rule: L1MuscleMemory): string {
  const parts = [
    rule.domain ? `域名=${rule.domain}` : "",
    rule.pathPattern ? `路径=${rule.pathPattern}` : "",
    rule.actionType ? `动作=${rule.actionType}` : "",
    trimLine(rule.physicalInstruction),
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
}

function summarizeL3Rule(rule: L3TacticalMemory): string {
  const parts = [
    rule.title ? `标题=${rule.title}` : "",
    rule.taskType ? `任务类型=${rule.taskType}` : "",
    rule.domainScope ? `域名=${rule.domainScope}` : "",
    trimLine(rule.tacticalRules),
  ].filter(Boolean);
  return `- ${parts.join(" | ")}`;
}

export function buildL1PromptContext(l1Rules: L1MuscleMemory[], limit = 3): string {
  if (l1Rules.length === 0) return "";
  return `[L1 页面操作经验]\n${l1Rules.slice(0, limit).map(summarizeL1Rule).join("\n")}`;
}

export function buildL3PromptContext(l3Rules: L3TacticalMemory[], limit = 3): string {
  if (l3Rules.length === 0) return "";
  return `[L3 任务策略经验]\n${l3Rules.slice(0, limit).map(summarizeL3Rule).join("\n")}`;
}

export function buildPlannerMemoryContext(input: {
  l1Rules: L1MuscleMemory[];
  l3Rules: L3TacticalMemory[];
}): string {
  return [buildL1PromptContext(input.l1Rules), buildL3PromptContext(input.l3Rules)]
    .filter(Boolean)
    .join("\n\n");
}

export function buildReplannerMemoryContext(input: {
  l1Rules: L1MuscleMemory[];
  l3Rules: L3TacticalMemory[];
}): string {
  const body = buildPlannerMemoryContext(input);
  if (!body) return "";
  return `${body}\n\n[使用要求]\n如果存在页面操作经验，优先利用这些经验调整恢复动作，避免重复尝试已知容易失败的方式。`;
}

export function buildExecutorL1Hints(l1Rules: L1MuscleMemory[], limit = 3): string[] {
  return l1Rules.slice(0, limit).map((rule) => trimLine(rule.physicalInstruction)).filter(Boolean);
}
