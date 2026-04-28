import type { SchedulerRuntimeState } from "../types/SchedulerState";
import type { SubtaskDag, SubtaskNode, SubtaskStatus } from "../types/SubtaskDag";
import type { TaskGraphExecutionMode } from "../types/TaskGraphPolicy";
import type { TaskGraphLaunchPayload, TaskGraphTaskInput } from "../types/TaskGraph";

export interface ReplayableDagBranchTarget {
  failedNodeId: string;
  title: string;
  rerunNodeIds: string[];
  blockedNodeIds: string[];
  reusedNodeIds: string[];
}

interface DagReplayContext {
  dag: SubtaskDag;
  runtime: SchedulerRuntimeState;
}

function getReplayContext(finalState: any): DagReplayContext | null {
  const dag = finalState?.subtask_dag;
  const runtime = finalState?.scheduler_runtime;
  if (!dag?.nodes || !runtime) {
    return null;
  }

  return { dag, runtime };
}

function buildChildrenMap(dag: SubtaskDag): Map<string, string[]> {
  const children = new Map<string, string[]>();
  Object.values(dag.nodes).forEach((node) => {
    node.dependsOn.forEach((depId) => {
      const next = children.get(depId) ?? [];
      next.push(node.id);
      children.set(depId, next);
    });
  });
  return children;
}

function collectDescendants(nodeId: string, childrenMap: Map<string, string[]>, target: Set<string>) {
  const children = childrenMap.get(nodeId) ?? [];
  children.forEach((childId) => {
    if (target.has(childId)) return;
    target.add(childId);
    collectDescendants(childId, childrenMap, target);
  });
}

function normalizeExecutionMode(value: any): TaskGraphExecutionMode | undefined {
  if (value === "shared_tab" || value === "single_page_serial" || value === "isolated_tabs") {
    return value;
  }
  return undefined;
}

function getNodeStatus(nodeId: string, dag: SubtaskDag, finalState: any): SubtaskStatus {
  const result = finalState?.subtask_results?.[nodeId];
  if (result?.success === true) return "succeeded";
  if (result?.success === false) return "failed";
  return dag.nodes[nodeId]?.status ?? "pending";
}

function resolveNodeSummary(nodeId: string, dag: SubtaskDag, finalState: any): string | undefined {
  const resultSummary = finalState?.subtask_results?.[nodeId]?.summary;
  if (typeof resultSummary === "string" && resultSummary.trim()) {
    return resultSummary.trim();
  }
  const outputSummary = dag.nodes[nodeId]?.outputRef?.summary;
  if (typeof outputSummary === "string" && outputSummary.trim()) {
    return outputSummary.trim();
  }
  return undefined;
}

function buildReplayDependencyContext(node: SubtaskNode, selectedNodeIds: Set<string>, dag: SubtaskDag, finalState: any) {
  return node.dependsOn
    .filter((depId) => !selectedNodeIds.has(depId))
    .map((depId) => {
      const depNode = dag.nodes[depId];
      const summary = resolveNodeSummary(depId, dag, finalState);
      if (!depNode || !summary) return null;
      return {
        id: depId,
        title: depNode.title,
        summary,
      };
    })
    .filter((item): item is { id: string; title: string; summary: string } => item !== null);
}

function toReplayTaskInput(
  node: SubtaskNode,
  selectedNodeIds: Set<string>,
  dag: SubtaskDag,
  finalState: any,
): TaskGraphTaskInput {
  const originalTaskInput = node.metadata?.originalTaskInput as TaskGraphTaskInput | undefined;
  const replayDependencyContext = buildReplayDependencyContext(node, selectedNodeIds, dag, finalState);
  const mergedMetadata = {
    ...(originalTaskInput?.metadata ?? {}),
    ...(node.metadata ?? {}),
    ...(replayDependencyContext.length > 0 ? { replayDependencyContext } : {}),
  };
  delete (mergedMetadata as Record<string, any>).originalTaskInput;

  return {
    id: node.id,
    title: originalTaskInput?.title ?? node.title,
    goal: originalTaskInput?.goal,
    description:
      originalTaskInput?.description ??
      node.description ??
      originalTaskInput?.goal ??
      node.title,
    dependsOn: node.dependsOn.filter((depId) => selectedNodeIds.has(depId)),
    maxAttempts: originalTaskInput?.maxAttempts ?? node.maxAttempts,
    resourceProfile:
      originalTaskInput?.resourceProfile ??
      (node.metadata?.resourceProfile as TaskGraphTaskInput["resourceProfile"] | undefined),
    metadata: mergedMetadata,
  };
}

export function listReplayableDagBranches(finalState: any): ReplayableDagBranchTarget[] {
  const context = getReplayContext(finalState);
  if (!context) {
    return [];
  }

  const { dag, runtime } = context;
  const childrenMap = buildChildrenMap(dag);

  return (runtime.failed ?? [])
    .map((failedNodeId) => {
      const node = dag.nodes[failedNodeId];
      if (!node) return null;

      const rerunNodeIds = new Set<string>([failedNodeId]);
      const descendants = new Set<string>();
      collectDescendants(failedNodeId, childrenMap, descendants);
      const reusedNodeIds = node.dependsOn.filter((depId) => getNodeStatus(depId, dag, finalState) === "succeeded");

      const blockedNodeIds = [...descendants].filter((nodeId) => {
        const status = getNodeStatus(nodeId, dag, finalState);
        if (status === "succeeded") return false;
        rerunNodeIds.add(nodeId);
        return status === "blocked";
      });

      [...descendants].forEach((nodeId) => {
        const status = getNodeStatus(nodeId, dag, finalState);
        if (status !== "succeeded") {
          rerunNodeIds.add(nodeId);
        }
      });

      const topoOrder = dag.topoOrder ?? Object.keys(dag.nodes);
      const orderedRerunIds = topoOrder.filter((nodeId) => rerunNodeIds.has(nodeId));

      return {
        failedNodeId,
        title: node.title,
        rerunNodeIds: orderedRerunIds,
        blockedNodeIds,
        reusedNodeIds,
      } satisfies ReplayableDagBranchTarget;
    })
    .filter((item): item is ReplayableDagBranchTarget => item !== null);
}

export function buildPartialDagReplayPayload(
  finalState: any,
  failedNodeId: string,
): TaskGraphLaunchPayload {
  const context = getReplayContext(finalState);
  if (!context) {
    throw new Error("当前结果中不包含可局部重跑的 DAG 上下文。");
  }

  const branch = listReplayableDagBranches(finalState).find((item) => item.failedNodeId === failedNodeId);
  if (!branch) {
    throw new Error(`未找到失败节点 ${failedNodeId} 的局部重跑分支。`);
  }

  const selectedNodeIds = new Set(branch.rerunNodeIds);
  const subtasks = branch.rerunNodeIds.map((nodeId) => {
    const node = context.dag.nodes[nodeId];
    if (!node) {
      throw new Error(`DAG 节点不存在: ${nodeId}`);
    }
    return toReplayTaskInput(node, selectedNodeIds, context.dag, finalState);
  });

  return {
    mode: "dag",
    goal:
      typeof finalState?.goal === "string" && finalState.goal.trim()
        ? `${finalState.goal}（局部重跑：${context.dag.nodes[failedNodeId]?.title || failedNodeId}）`
        : `DAG 局部重跑：${context.dag.nodes[failedNodeId]?.title || failedNodeId}`,
    subtasks,
    maxParallelSubAgents:
      typeof finalState?.dag_max_parallel_sub_agents === "number"
        ? finalState.dag_max_parallel_sub_agents
        : undefined,
    executionMode: normalizeExecutionMode(finalState?.dag_execution_mode),
  };
}
