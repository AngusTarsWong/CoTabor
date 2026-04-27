import { memoryStore } from "../store/indexeddb";
import { buildRawTraces } from "./raw-trace-builder";
import type { RawTraceRecord, TaskRunRecord } from "../../shared/types/memory";
import type { TaskGraphExecutionMode } from "../../core/orchestrator/types/TaskGraphPolicy";
import type { SubtaskNode } from "../../core/orchestrator/types/SubtaskDag";

function buildDagNodeTaskRunId(dagRunId: string, nodeId: string): string {
  return `dag_node_${dagRunId}_${nodeId}_${Math.random().toString(36).slice(2, 7)}`;
}

function extractSummary(finalState: any, fallback?: string): string {
  const candidates = [
    fallback,
    finalState?.planner_output?.action?.description,
    finalState?.planner_output?.action?.result,
    finalState?.output,
    finalState?.summary,
    finalState?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function toDagNodeRawTraces(
  taskRunId: string,
  dagRunId: string,
  node: SubtaskNode,
  executionMode: TaskGraphExecutionMode,
  sandboxTabId: number | undefined,
  totalHistory: any[] = [],
): RawTraceRecord[] {
  return buildRawTraces(taskRunId, totalHistory).map((trace) => ({
    ...trace,
    runScope: "DAG_NODE",
    dagRunId,
    dagNodeId: node.id,
    dagNodeTitle: node.title,
    dagExecutionMode: executionMode,
    sandboxTabId,
  }));
}

export interface PersistDagNodeExecutionInput {
  dagRunId: string;
  node: SubtaskNode;
  executionMode: TaskGraphExecutionMode;
  finalState?: any;
  success: boolean;
  summary?: string;
  error?: string;
  sandboxGroupId?: number;
  sandboxTabId?: number;
}

export interface PersistDagNodeExecutionResult {
  taskRunId: string;
  traceCount: number;
}

export async function persistDagNodeExecution(
  input: PersistDagNodeExecutionInput,
): Promise<PersistDagNodeExecutionResult> {
  const now = Date.now();
  const totalHistory = Array.isArray(input.finalState?.total_history) ? input.finalState.total_history : [];
  const taskRunId = input.finalState?.task_run_id || buildDagNodeTaskRunId(input.dagRunId, input.node.id);
  const traces = toDagNodeRawTraces(
    taskRunId,
    input.dagRunId,
    input.node,
    input.executionMode,
    input.sandboxTabId,
    totalHistory,
  );

  if (traces.length > 0) {
    await memoryStore.putRawTraces(traces);
  }

  const taskRun: TaskRunRecord = {
    id: taskRunId,
    goal: input.finalState?.request || input.node.description || input.node.title,
    status: input.finalState?.status || (input.success ? "FINISHED" : "FAILED"),
    runScope: "DAG_NODE",
    dagRunId: input.dagRunId,
    dagNodeId: input.node.id,
    dagNodeTitle: input.node.title,
    dagParentNodeIds: [...input.node.dependsOn],
    dagExecutionMode: input.executionMode,
    resourceProfile:
      input.node.metadata?.resourceProfile || input.node.metadata?.resource_profile || undefined,
    sandboxGroupId: input.sandboxGroupId,
    sandboxTabId: input.sandboxTabId,
    startedAt: Number(totalHistory[0]?.ts || totalHistory[0]?.meta?.timestamp || now),
    finishedAt: Number(
      totalHistory[totalHistory.length - 1]?.ts ||
        totalHistory[totalHistory.length - 1]?.meta?.timestamp ||
        now,
    ),
    hostUrl: input.finalState?.meta_data?.url,
    hostTitle: input.finalState?.meta_data?.title,
    globalSummary: extractSummary(input.finalState, input.summary),
    traceCount: traces.length,
    candidateCount: 0,
    committedL1: 0,
    committedL2: 0,
    committedL3: 0,
    droppedCount: 0,
    localPersistStatus: "saved",
    experienceStatus: "SKIPPED",
    cloudSyncStatus: "pending",
    cloudSyncError: input.error,
    updatedAt: now,
  };

  await memoryStore.putTaskRun(taskRun);

  return {
    taskRunId,
    traceCount: traces.length,
  };
}

