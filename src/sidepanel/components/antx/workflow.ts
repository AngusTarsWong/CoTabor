import { HumanRequest } from "../../../lib/claw";
import type { PlannedAction } from "../../../core/types/history";

export type WorkflowNodeKind = "llm" | "system" | "human" | "subgraph";
export type WorkflowNodeStatus = "running" | "done" | "error" | "waiting";

export type WorkflowNodeRecord = {
  id: string;
  nodeName: string;
  parentId: string | null;
  depth: number;
  subgraphName: string | null;
  kind: WorkflowNodeKind;
  status: WorkflowNodeStatus;
  summary: string;
  detail: string;
  modelName?: string;
  tokens?: number;
  durationMs?: number;
  order: number;
  startedAt?: number;
  updatedAt: number;
  stepId?: number;
  taskRunId?: string;
  thinkingContent?: string;
  streamContent?: string;
  rawUpdate?: Record<string, any>;
};

export type WorkflowTreeNode = WorkflowNodeRecord & {
  children: WorkflowTreeNode[];
};

const TOP_LEVEL_NODE_NAMES = [
  "memory",
  "planner",
  "executor",
  "watchdog",
  "cortex",
  "replanner",
  "human",
  "experience",
];

type StepLike = {
  node?: string;
  update?: Record<string, any>;
  duration_ms?: number;
  ts?: number;
  runtime?: {
    modelName?: string;
    stepTokens?: number;
  };
};

type HistoryStepLike = {
  action?: PlannedAction | null;
  result?: Record<string, any> | null;
  step_summary?: string;
  meta?: Record<string, unknown>;
};

export function inferParentNodeName(nodeName: string): string | null {
  if (!nodeName) return null;
  for (const topLevel of TOP_LEVEL_NODE_NAMES) {
    if (nodeName !== topLevel && nodeName.startsWith(`${topLevel}_`)) {
      return topLevel;
    }
  }
  return null;
}

function inferNodeKind(
  nodeName: string,
  modelName?: string,
  tokens?: number,
  parentNodeName?: string | null
): WorkflowNodeKind {
  if (nodeName === "human") return "human";
  if (parentNodeName) return "subgraph";
  if ((tokens || 0) > 0 || (modelName && modelName !== "unknown" && modelName !== "midscene-internal")) {
    return "llm";
  }
  return "system";
}

function fallbackSummary(nodeName: string, status: WorkflowNodeStatus): string {
  if (status === "running") return `节点 ${nodeName} 正在执行中`;
  if (status === "error") return `节点 ${nodeName} 执行失败`;
  if (status === "waiting") return `节点 ${nodeName} 等待继续`;
  return `节点 ${nodeName} 已完成执行`;
}

function normalizeInlineText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, limit = 160): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function asHistoryStep(item: unknown): HistoryStepLike | null {
  if (!item || typeof item !== "object") return null;
  return item as HistoryStepLike;
}

function getLatestHistoryStep(update: Record<string, any>): HistoryStepLike | null {
  const history = Array.isArray(update?.total_history) ? update.total_history : [];
  return history.length > 0 ? asHistoryStep(history[history.length - 1]) : null;
}

function getPrimaryAction(update: Record<string, any>): PlannedAction | null {
  const directAction = update?.planner_output?.action;
  if (directAction && typeof directAction === "object") {
    return directAction as PlannedAction;
  }
  return getLatestHistoryStep(update)?.action || null;
}

function buildActionGoal(action?: PlannedAction | null): string {
  if (!action) return "";
  if (action.type === "finish") {
    return normalizeInlineText(action.result || action.summary || action.description) || "结束当前任务";
  }
  if (action.type === "ui_interact") {
    return normalizeInlineText(action.intent || action.description) || "执行页面交互";
  }
  if (action.type === "call_skill") {
    const describedGoal = normalizeInlineText(action.intent || action.description);
    if (describedGoal) return describedGoal;
    return action.skill_name ? `调用 ${action.skill_name}` : "调用工具能力";
  }
  if (action.type === "memorize") {
    return normalizeInlineText(action.description || action.intent) || "记录关键信息";
  }
  if (action.type === "read") {
    return normalizeInlineText(action.description || action.intent) || "读取当前页面信息";
  }
  return (
    normalizeInlineText(action.intent || action.description) ||
    normalizeInlineText(action.skill_name) ||
    normalizeInlineText(action.type)
  );
}

function buildExecutorOutcome(step: HistoryStepLike | null): string {
  const result = step?.result || null;
  if (!result || typeof result !== "object") return "";
  const error = normalizeInlineText(result.error || result.reason);
  if (error) return `执行未完成：${truncateText(error)}`;

  const message = normalizeInlineText(result.message);
  if (message) return truncateText(message);

  const textContent = normalizeInlineText(result.text_content);
  if (textContent) return truncateText(textContent);

  const skillStatus = normalizeInlineText(result.skill_result?.status);
  if (skillStatus) return `执行结果：${skillStatus}`;

  if (result.success === true) return "执行完成";
  return "";
}

function buildWatchdogSummary(update: Record<string, any>): string {
  const lastHistoryStep = getLatestHistoryStep(update);
  const historySummary = normalizeInlineText(lastHistoryStep?.step_summary);
  if (historySummary) return truncateText(historySummary);

  const output = update?.watchdog_output;
  const actionGoal = buildActionGoal(lastHistoryStep?.action || getPrimaryAction(update));
  const reason = normalizeInlineText(output?.reason);

  if (output?.status === "PASS") {
    return actionGoal ? `已完成：${actionGoal}` : "已完成当前检查";
  }
  if (output?.status === "FAIL") {
    if (reason) return `未完成：${truncateText(reason)}`;
    return actionGoal ? `未完成：${actionGoal}` : "未达到预期结果";
  }

  return "";
}

function buildMemorySummary(update: Record<string, any>): string {
  const usage = update?.node_memory_usage;
  const count = typeof usage?.count === "number"
    ? usage.count
    : (Array.isArray(usage?.l1) ? usage.l1.length : 0)
      + (Array.isArray(usage?.l2) ? usage.l2.length : 0)
      + (Array.isArray(usage?.l3) ? usage.l3.length : 0);

  if (count > 0) return `读取 ${count} 条相关经验，为下一步提供上下文`;
  if (update?.long_term_memory?.summary) return "整理当前上下文，并补充长期记忆摘要";
  return "准备后续规划与执行所需的上下文";
}

function buildExperienceSummary(update: Record<string, any>): string {
  const topic = normalizeInlineText(update?.experience_buffer?.summary || update?.experience_buffer?.topic);
  if (topic) return `沉淀经验主题：${truncateText(topic)}`;
  return "整理本次任务中的可复用经验";
}

function buildHumanSummary(update: Record<string, any>, status: WorkflowNodeStatus): string {
  const request = update?.human_request;
  const actionDescription = normalizeInlineText(request?.action_description);
  if (actionDescription) return actionDescription;
  const message = normalizeInlineText(request?.message);
  if (message) return message;
  return status === "waiting" ? "等待用户确认后继续" : "人工确认已完成";
}

export function buildStepSummary(step: StepLike, status: WorkflowNodeStatus): string {
  const nodeName = step.node || "unknown";
  const update = step.update || {};

  if (nodeName === "planner") {
    const goal = buildActionGoal(getPrimaryAction(update));
    if (goal) return goal;
  }

  if (nodeName === "executor") {
    const actionGoal = buildActionGoal(getPrimaryAction(update));
    if (actionGoal) return actionGoal;
    const outcome = buildExecutorOutcome(getLatestHistoryStep(update));
    if (outcome) return outcome;
  }

  if (nodeName === "watchdog") {
    const summary = buildWatchdogSummary(update);
    if (summary) return summary;
  }

  if (nodeName === "replanner") {
    const goal = buildActionGoal(getPrimaryAction(update));
    if (goal) return goal;
  }

  if (nodeName === "memory") {
    return buildMemorySummary(update);
  }

  if (nodeName === "experience") {
    return buildExperienceSummary(update);
  }

  if (nodeName === "cortex") {
    if (update?.route?.escalate_to === "replanner") {
      return `页面恢复未完成，升级到 ${update.route.escalate_to}`;
    }
    if (update?.cortex_thought) return truncateText(normalizeInlineText(update.cortex_thought), 180);
    return "分析当前页面状态并尝试恢复执行";
  }

  if (nodeName === "cortex_planner_executor") {
    const description = normalizeInlineText(update?.cortex_action?.description);
    if (description) return description;
    return "生成并执行恢复动作";
  }

  if (nodeName === "cortex_evaluator") {
    if (update?.route?.escalate_to === "replanner") {
      return `恢复效果不足，升级到 ${update.route.escalate_to}`;
    }
    return "判断恢复动作是否已经让任务继续推进";
  }

  if (nodeName === "human") {
    return buildHumanSummary(update, status);
  }

  return fallbackSummary(nodeName, status);
}

export function buildStepDetail(step: StepLike, status: WorkflowNodeStatus): string {
  const nodeName = step.node || "unknown";
  const update = step.update || {};

  if (status === "error" && typeof update?.error === "string") {
    return update.error;
  }

  if (nodeName === "watchdog" && update?.watchdog_output?.reason) {
    return String(update.watchdog_output.reason);
  }

  if (nodeName === "executor") {
    const outcome = buildExecutorOutcome(getLatestHistoryStep(update));
    if (outcome) return outcome;
  }

  if (nodeName === "cortex" && update?.route?.route_reason) {
    return String(update.route.route_reason);
  }

  if (nodeName === "planner" && update?.planner_output?.reasoning) {
    return String(update.planner_output.reasoning);
  }

  if (nodeName === "replanner" && update?.replan_context) {
    return String(update.replan_context);
  }

  if (nodeName === "human") {
    return buildHumanSummary(update, status);
  }

  return "";
}

export function buildWorkflowNodeFromLlmStart(input: {
  nodeName: string;
  stepId: number;
  modelName?: string;
  order: number;
  timestamp: number;
  taskRunId?: string;
}): WorkflowNodeRecord {
  const parentNodeName = inferParentNodeName(input.nodeName);
  return {
    id: `llm-${input.stepId}`,
    stepId: input.stepId,
    nodeName: input.nodeName,
    parentId: parentNodeName,
    depth: parentNodeName ? 1 : 0,
    subgraphName: parentNodeName,
    kind: inferNodeKind(input.nodeName, input.modelName, undefined, parentNodeName),
    status: "running",
    summary: fallbackSummary(input.nodeName, "running"),
    detail: "",
    modelName: input.modelName,
    taskRunId: input.taskRunId,
    order: input.order,
    startedAt: input.timestamp,
    updatedAt: input.timestamp,
    thinkingContent: "",
    streamContent: "",
  };
}

export function buildWorkflowNodeFromStep(step: StepLike, order: number): WorkflowNodeRecord {
  const nodeName = step.node || "unknown";
  const update = step.update || {};
  const parentNodeName = inferParentNodeName(nodeName);
  const runtime = step.runtime || {};
  const status: WorkflowNodeStatus = typeof step.update?.error === "string" ? "error" : "done";

  return {
    id: `${nodeName}-${order}`,
    nodeName,
    parentId: parentNodeName,
    depth: parentNodeName ? 1 : 0,
    subgraphName: parentNodeName,
    kind: inferNodeKind(nodeName, runtime.modelName, runtime.stepTokens, parentNodeName),
    status,
    summary: buildStepSummary(step, status),
    detail: buildStepDetail(step, status),
    modelName: runtime.modelName,
    tokens: runtime.stepTokens,
    durationMs: step.duration_ms,
    order,
    startedAt: step.ts || Date.now(),
    updatedAt: step.ts || Date.now(),
    rawUpdate: update,
  };
}

export function buildWorkflowNodeFromHumanRequest(
  request: HumanRequest,
  order: number
): WorkflowNodeRecord {
  const timestamp = Date.now();
  return {
    id: `human-${order}`,
    nodeName: "human",
    parentId: null,
    depth: 0,
    subgraphName: null,
    kind: "human",
    status: "waiting",
    summary: request.type === "login" ? "等待用户完成登录或验证" : "等待用户确认后继续",
    detail: request.action_description || request.message,
    order,
    startedAt: timestamp,
    updatedAt: timestamp,
    rawUpdate: {
      human_request: request,
    },
  };
}

export function buildWorkflowTree(nodes: WorkflowNodeRecord[]): WorkflowTreeNode[] {
  const nodeMap = new Map<string, WorkflowTreeNode>();
  const roots: WorkflowTreeNode[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const current = nodeMap.get(node.id)!;
    if (node.parentId) {
      const parent = Array.from(nodeMap.values())
        .filter((candidate) => candidate.nodeName === node.parentId)
        .sort((a, b) => b.order - a.order)[0];
      if (parent) {
        parent.children.push(current);
        continue;
      }
    }
    roots.push(current);
  }

  const sortTree = (items: WorkflowTreeNode[]) => {
    items.sort((a, b) => a.order - b.order);
    items.forEach((item) => sortTree(item.children));
  };

  sortTree(roots);
  return roots;
}
