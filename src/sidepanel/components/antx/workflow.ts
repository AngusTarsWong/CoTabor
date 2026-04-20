import { HumanRequest } from "../../../lib/claw";

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
  updatedAt: number;
  stepId?: number;
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

export function buildStepSummary(step: StepLike, status: WorkflowNodeStatus): string {
  const nodeName = step.node || "unknown";
  const update = step.update || {};

  if (nodeName === "planner") {
    const action = update?.planner_output?.action;
    if (action?.type) {
      return `生成动作计划：${action.type}${action.skill_name ? ` (${action.skill_name})` : ""}`;
    }
  }

  if (nodeName === "executor") {
    const history = Array.isArray(update?.total_history) ? update.total_history : [];
    const last = history.length > 0 ? history[history.length - 1] : null;
    if (last?.result?.success) return "执行完成，操作结果已写入历史";
    if (last?.result?.error) return `执行失败：${last.result.error}`;
  }

  if (nodeName === "watchdog") {
    const output = update?.watchdog_output;
    if (output?.status === "PASS") return "审查通过，允许进入下一阶段";
    if (output?.status === "FAIL") return `审查失败：${output.reason || "需要恢复或重规划"}`;
  }

  if (nodeName === "replanner") {
    const action = update?.planner_output?.action;
    if (action?.type === "finish") return "重规划判断任务已经完成";
    if (action?.type) {
      return `重规划生成恢复动作：${action.type}${action.skill_name ? ` (${action.skill_name})` : ""}`;
    }
  }

  if (nodeName === "memory") {
    if (update?.long_term_memory?.summary) return "完成上下文整理并更新长期记忆摘要";
    return "完成上下文与记忆准备";
  }

  if (nodeName === "experience") {
    if (update?.experience_buffer) return "完成经验提取与任务复盘";
    return "完成任务收尾与经验沉淀";
  }

  if (nodeName === "cortex") {
    if (update?.route?.escalate_to === "replanner") {
      return `恢复失败，升级到 ${update.route.escalate_to}`;
    }
    if (update?.cortex_thought) return String(update.cortex_thought);
    return "进入视觉恢复流程";
  }

  if (nodeName === "cortex_planner_executor") {
    if (update?.cortex_action?.description) return String(update.cortex_action.description);
    return "生成并执行视觉恢复动作";
  }

  if (nodeName === "cortex_evaluator") {
    if (update?.route?.escalate_to === "replanner") {
      return `恢复评估失败，升级到 ${update.route.escalate_to}`;
    }
    return "完成恢复结果评估";
  }

  if (nodeName === "human") {
    return status === "waiting" ? "等待用户确认后继续" : "人工确认已完成";
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

  if (nodeName === "cortex" && update?.route?.route_reason) {
    return String(update.route.route_reason);
  }

  if (nodeName === "planner" && update?.planner_output?.reasoning) {
    return String(update.planner_output.reasoning);
  }

  if (nodeName === "replanner" && update?.replan_context) {
    return String(update.replan_context);
  }

  return "";
}

export function buildWorkflowNodeFromLlmStart(input: {
  nodeName: string;
  stepId: number;
  modelName?: string;
  order: number;
  timestamp: number;
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
    order: input.order,
    updatedAt: input.timestamp,
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
    updatedAt: step.ts || Date.now(),
    rawUpdate: update,
  };
}

export function buildWorkflowNodeFromHumanRequest(
  request: HumanRequest,
  order: number
): WorkflowNodeRecord {
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
    updatedAt: Date.now(),
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
