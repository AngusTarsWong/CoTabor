import { HumanRequest } from "../../../lib/claw";
import type { PlannedAction } from "../../../core/types/history";
import { i18n } from "../../../i18n";
import { TFunction } from "i18next";

function getT(): TFunction {
  return i18n.getFixedT(null, 'sidepanel');
}

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
  "dag_launch_planner",
  "planner",
  "executor",
  "watchdog",
  "cortex",
  "replanner",
  "human",
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
  taskRunId?: string;
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
  const t = getT();
  if (status === "running") return t('workflow.status.running', { name: nodeName });
  if (status === "error") return t('workflow.status.failed', { name: nodeName });
  if (status === "waiting") return t('workflow.status.waiting', { name: nodeName });
  return t('workflow.status.completed', { name: nodeName });
}

function normalizeInlineText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, limit = 160): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

const ACTION_SEGMENT_DELIMITER = /[，,；;。]/;
const ACTION_KEYWORDS = [
  "点击", "Click",
  "打开", "Open",
  "跳转", "Jump",
  "进入", "Enter",
  "输入", "Type",
  "搜索", "Search",
  "切换", "Switch",
  "滚动", "Scroll",
  "读取", "Read",
  "提取", "Extract",
  "调用", "Call",
  "提交", "Submit",
  "确认", "Confirm",
  "导航", "Navigate",
  "返回", "Back",
  "选择", "Select",
  "展开", "Expand",
  "关闭", "Close",
  "聚焦", "Focus",
  "观察", "Observe",
  "定位", "Locate",
  "恢复", "Recover",
];

function asHistoryStep(item: unknown): HistoryStepLike | null {
  if (!item || typeof item !== "object") return null;
  return item as HistoryStepLike;
}

function getLatestHistoryStep(update: Record<string, any>): HistoryStepLike | null {
  const history = Array.isArray(update?.total_history) ? update.total_history : [];
  return history.length > 0 ? asHistoryStep(history[history.length - 1]) : null;
}

function getLatestDebugPayload(update: Record<string, any>, nodeName?: string): Record<string, any> | null {
  const payloads = Array.isArray(update?.debug_payloads) ? update.debug_payloads : [];
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    const item = payloads[index];
    if (!item || typeof item !== "object") continue;
    if (!nodeName || item.node === nodeName) {
      return item as Record<string, any>;
    }
  }
  return null;
}

function getPrimaryAction(update: Record<string, any>): PlannedAction | null {
  const directAction = update?.planner_output?.action;
  if (directAction && typeof directAction === "object") {
    return directAction as PlannedAction;
  }
  return getLatestHistoryStep(update)?.action || null;
}

function buildActionGoal(action?: PlannedAction | null): string {
  const t = getT();
  if (!action) return "";
  if (action.type === "finish") {
    return normalizeInlineText(action.result || action.summary || action.description) || t('workflow.action.finish');
  }
  if (action.type === "ui_interact") {
    return normalizeInlineText(action.intent || action.description) || t('workflow.action.uiInteract');
  }
  if (action.type === "call_skill") {
    const describedGoal = normalizeInlineText(action.intent || action.description);
    if (describedGoal) return describedGoal;
    return action.skill_name ? t('workflow.action.callSkillNamed', { name: action.skill_name }) : t('workflow.action.callSkill');
  }
  if (action.type === "memorize") {
    return normalizeInlineText(action.description || action.intent) || t('workflow.action.memorize');
  }
  if (action.type === "read") {
    return normalizeInlineText(action.description || action.intent) || t('workflow.action.read');
  }
  return (
    normalizeInlineText(action.intent || action.description) ||
    normalizeInlineText(action.skill_name) ||
    normalizeInlineText(action.type) ||
    t('workflow.action.unknown')
  );
}

function extractPrimaryOperation(text: string): string {
  const normalized = normalizeInlineText(text);
  if (!normalized) return "";

  const segments = normalized
    .split(ACTION_SEGMENT_DELIMITER)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidate =
    segments.find((segment) => ACTION_KEYWORDS.some((keyword) => segment.toLowerCase().includes(keyword.toLowerCase()))) ||
    segments[0] ||
    normalized;

  return candidate
    .replace(/^(首先|先|接下来|下一步|当前|现在|然后|需要|请|First|Then|Next|Now|Currently|Finally|Please)\s*/ui, "")
    .trim();
}

function prefixSummary(prefix: string, content: string): string {
  const normalized = normalizeInlineText(content);
  if (!normalized) return prefix;
  return `${prefix}${normalized}`;
}

function buildPlannerSummary(update: Record<string, any>): string {
  const t = getT();
  const goal = buildActionGoal(getPrimaryAction(update));
  return goal ? prefixSummary(t('workflow.prefix.nextStep'), goal) : "";
}

function buildExecutorSummary(update: Record<string, any>): string {
  const t = getT();
  const actionGoal = buildActionGoal(getPrimaryAction(update));
  if (actionGoal) {
    return prefixSummary(t('workflow.prefix.executing'), extractPrimaryOperation(actionGoal) || actionGoal);
  }

  const outcome = buildExecutorOutcome(getLatestHistoryStep(update));
  if (outcome) {
    return prefixSummary(t('workflow.prefix.executing'), outcome);
  }

  return "";
}

function buildExecutorOutcome(step: HistoryStepLike | null): string {
  const t = getT();
  const result = step?.result || null;
  if (!result || typeof result !== "object") return "";
  const error = normalizeInlineText(result.error || result.reason);
  if (error) return t('workflow.prefix.incomplete', { error: truncateText(error) });

  const message = normalizeInlineText(result.message);
  if (message) return truncateText(message);

  const textContent = normalizeInlineText(result.text_content);
  if (textContent) return truncateText(textContent);

  const skillStatus = normalizeInlineText(result.skill_result?.status);
  if (skillStatus) return t('workflow.prefix.skillResult', { status: skillStatus });

  if (result.success === true) return t('workflow.prefix.completed');
  return "";
}

function buildWatchdogSummary(update: Record<string, any>): string {
  const t = getT();
  const lastHistoryStep = getLatestHistoryStep(update);
  const historySummary = normalizeInlineText(lastHistoryStep?.step_summary);
  if (historySummary) {
    const [targetPart, ...restParts] = historySummary.split("—").map((item) => item.trim()).filter(Boolean);
    const target = extractPrimaryOperation(targetPart || historySummary);
    const rest = restParts.join(" — ");
    const resultSummaryMatch = rest.match(/结果摘要[:：]\s*(.+)$/u);
    const resultSummary = resultSummaryMatch ? truncateText(resultSummaryMatch[1], 90) : "";

    if (rest.includes("成功") || rest.toLowerCase().includes("success")) {
      return resultSummary
        ? t('workflow.check.passDetailed', { target, summary: resultSummary })
        : t('workflow.check.pass', { target });
    }

    if (rest.includes("未达到预期") || rest.toLowerCase().includes("not expected")) {
      return resultSummary
        ? t('workflow.check.failDetailed', { target, summary: resultSummary })
        : t('workflow.check.failGeneric', { target });
    }

    return prefixSummary(t('workflow.prefix.checkResult'), historySummary);
  }

  const output = update?.watchdog_output;
  const actionGoal = buildActionGoal(lastHistoryStep?.action || getPrimaryAction(update));
  const reason = normalizeInlineText(output?.reason);

  if (output?.status === "PASS") {
    return actionGoal ? t('workflow.check.pass', { target: extractPrimaryOperation(actionGoal) || actionGoal }) : t('workflow.check.finished');
  }
  if (output?.status === "FAIL") {
    if (reason) return t('workflow.check.fail', { reason: truncateText(reason) });
    return actionGoal ? t('workflow.check.failDetailed', { target: extractPrimaryOperation(actionGoal) || actionGoal, summary: t('workflow.check.failGeneric') }) : t('workflow.check.failGeneric');
  }

  return "";
}

function buildHumanSummary(update: Record<string, any>, status: WorkflowNodeStatus): string {
  const t = getT();
  const request = update?.human_request;
  const actionDescription = normalizeInlineText(request?.action_description);
  if (actionDescription) return actionDescription;
  const message = normalizeInlineText(request?.message);
  if (message) return message;
  
  if (status === "waiting") {
    return request?.type === "login" ? t('workflow.human.login') : t('workflow.human.confirm');
  }
  return t('workflow.human.completed');
}

function buildDagPlanSummary(update: Record<string, any>, status: WorkflowNodeStatus): string {
  const t = getT();
  const plan = update?.dag_plan;
  if (status === "running") return t('workflow.dag.analyzing');
  if (status === "error") return t('workflow.dag.failed');
  const subtasks = Array.isArray(plan?.subtasks) ? plan.subtasks : [];
  if (subtasks.length > 0) {
    const mode = normalizeInlineText(plan?.executionMode);
    const parallel = typeof plan?.maxParallelSubAgents === "number" ? plan.maxParallelSubAgents : undefined;
    const suffix = [
      mode ? t('workflow.dag.mode', { mode }) : "",
      parallel ? t('workflow.dag.parallel', { parallel }) : "",
    ].filter(Boolean).join("，");
    return suffix ? t('workflow.dag.planned', { count: subtasks.length, suffix }) : t('workflow.dag.plannedShort', { count: subtasks.length });
  }
  return t('workflow.dag.completed');
}

function buildDagPlanDetail(update: Record<string, any>): string {
  const t = getT();
  const plan = update?.dag_plan;
  const subtasks = Array.isArray(plan?.subtasks) ? plan.subtasks : [];
  if (subtasks.length === 0) {
    const raw = normalizeInlineText(update?.rawContent);
    return raw ? truncateText(raw, 1000) : "";
  }

  return subtasks
    .map((task: any, index: number) => {
      const title = normalizeInlineText(task?.title) || normalizeInlineText(task?.id) || `${t('workflow.dag.subtask', { title: index + 1 })}`;
      const description = normalizeInlineText(task?.description || task?.goal);
      const dependsOn = Array.isArray(task?.dependsOn) && task.dependsOn.length > 0
        ? t('workflow.dag.dependency', { nodes: task.dependsOn.join(", ") })
        : t('workflow.dag.dependencyNone');
      return `${index + 1}. ${title}${description ? `\n   ${description}` : ""}\n   ${dependsOn}`;
    })
    .join("\n");
}

function buildDagTaskSummary(update: Record<string, any>): string {
  const t = getT();
  const task = update?.dag_task ?? {};
  const title = normalizeInlineText(task.title) || normalizeInlineText(task.id) || t('workflow.dag.subtask', { title: "unknown" });
  return t('workflow.dag.subtask', { title });
}

function buildDagTaskDetail(update: Record<string, any>): string {
  const t = getT();
  const task = update?.dag_task ?? {};
  const description = normalizeInlineText(task.description || task.goal);
  const dependsOn = Array.isArray(task.dependsOn) && task.dependsOn.length > 0
    ? t('workflow.dag.dependency', { nodes: task.dependsOn.join(", ") })
    : t('workflow.dag.dependencyNone');
  const profile = normalizeInlineText(task.resourceProfile);
  return [
    description,
    dependsOn,
    profile ? t('workflow.dag.resourceProfile', { profile }) : "",
  ].filter(Boolean).join("\n");
}

function buildCortexTarget(update: Record<string, any>): string {
  const debugPayload = getLatestDebugPayload(update, "cortex");
  const elementDescription = normalizeInlineText(debugPayload?.input?.elementDescription);
  if (elementDescription) return elementDescription;

  const cortexDescription = normalizeInlineText(update?.cortex_action?.description || update?.cortex_thought);
  if (cortexDescription) return cortexDescription;

  return "";
}

function buildCortexEvaluatorSummary(update: Record<string, any>): string {
  const t = getT();
  const routeReason = normalizeInlineText(update?.route?.route_reason);
  const debugPayload = getLatestDebugPayload(update, "cortex");
  const message = normalizeInlineText(debugPayload?.output?.message || update?.cortex_thought);
  if (update?.route?.escalate_to === "replanner") {
    const escalateReason = routeReason || normalizeInlineText(update?.watchdog_output?.reason);
    return escalateReason ? t('workflow.cortex.failed', { reason: truncateText(escalateReason) }) : t('workflow.cortex.failedGeneric');
  }
  if (routeReason === "return to planner") {
    return message ? t('workflow.cortex.success', { message: truncateText(message) }) : t('workflow.cortex.successGeneric');
  }
  if (message) return truncateText(message);
  return "";
}

export function buildStepSummary(step: StepLike, status: WorkflowNodeStatus): string {
  const t = getT();
  const nodeName = step.node || "unknown";
  const update = step.update || {};

  if (nodeName === "planner") {
    const summary = buildPlannerSummary(update);
    if (summary) return summary;
  }

  if (nodeName === "dag_launch_planner") {
    return buildDagPlanSummary(update, status);
  }

  if (nodeName.startsWith("dag_launch_planner_")) {
    return buildDagTaskSummary(update);
  }

  if (nodeName === "executor") {
    const summary = buildExecutorSummary(update);
    if (summary) return summary;
  }

  if (nodeName === "watchdog") {
    const summary = buildWatchdogSummary(update);
    if (summary) return summary;
  }

  if (nodeName === "replanner") {
    const goal = buildActionGoal(getPrimaryAction(update));
    if (goal) return goal;
  }

  if (nodeName === "cortex") {
    if (update?.route?.escalate_to === "replanner") {
      return t('workflow.cortex.escalate', { to: update.route.escalate_to });
    }
    const target = buildCortexTarget(update);
    if (target) return t('workflow.cortex.tryRecovery', { target: truncateText(target, 180) });
    return t('workflow.cortex.analyze');
  }

  if (nodeName === "cortex_planner_executor") {
    const target = buildCortexTarget(update);
    if (target) return t('workflow.cortex.tryRecovery', { target: truncateText(target, 180) });
    return t('workflow.cortex.generate');
  }

  if (nodeName === "cortex_evaluator") {
    const summary = buildCortexEvaluatorSummary(update);
    if (summary) return summary;
    return t('workflow.cortex.evaluate');
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

  if (nodeName === "dag_launch_planner") {
    return buildDagPlanDetail(update);
  }

  if (nodeName.startsWith("dag_launch_planner_")) {
    return buildDagTaskDetail(update);
  }

  if (nodeName === "replanner" && update?.replan_context) {
    return String(update.replan_context);
  }

  if (nodeName === "cortex_planner_executor") {
    const debugPayload = getLatestDebugPayload(update, "cortex");
    const reason = normalizeInlineText(debugPayload?.input?.reason);
    if (reason) return reason;
  }

  if (nodeName === "cortex_evaluator") {
    const summary = buildCortexEvaluatorSummary(update);
    if (summary) return summary;
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
    taskRunId: step.taskRunId,
  };
}

export function buildWorkflowNodeFromHumanRequest(
  request: HumanRequest,
  order: number
): WorkflowNodeRecord {
  const t = getT();
  const timestamp = Date.now();
  return {
    id: `human-${order}`,
    nodeName: "human",
    parentId: null,
    depth: 0,
    subgraphName: null,
    kind: "human",
    status: "waiting",
    summary: request.type === "login" ? t('workflow.human.login') : t('workflow.human.confirm'),
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
