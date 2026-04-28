import { memoryStore } from "../../../memory/store/indexeddb";
import type { RawTraceRecord, TaskRunRecord } from "../../../shared/types/memory";

export interface ReplayableDagNode {
  nodeId: string;
  title: string;
  taskRunId: string;
  success: boolean;
  summary?: string;
}

export interface TaskRunReplaySnapshot {
  taskRun: TaskRunRecord;
  rawTraces: RawTraceRecord[];
  replayGoal: string;
  label: string;
}

export function listReplayableDagNodes(finalState: any): ReplayableDagNode[] {
  const dagNodes = finalState?.subtask_dag?.nodes;
  const subtaskResults = finalState?.subtask_results;
  if (!dagNodes || !subtaskResults) {
    return [];
  }

  return Object.entries(subtaskResults)
    .map(([nodeId, result]: [string, any]) => {
      const taskRunId = result?.taskRunId;
      if (typeof taskRunId !== "string" || !taskRunId.trim()) {
        return null;
      }

      return {
        nodeId,
        title: dagNodes[nodeId]?.title || nodeId,
        taskRunId,
        success: result?.success === true,
        summary: typeof result?.summary === "string" ? result.summary : undefined,
      } satisfies ReplayableDagNode;
    })
    .filter((item): item is ReplayableDagNode => item !== null);
}

export async function loadTaskRunReplaySnapshot(taskRunId: string): Promise<TaskRunReplaySnapshot> {
  const taskRun = await memoryStore.getTaskRun(taskRunId);
  if (!taskRun) {
    throw new Error(`TaskRun not found: ${taskRunId}`);
  }

  const replayGoal = typeof taskRun.goal === "string" ? taskRun.goal.trim() : "";
  if (!replayGoal) {
    throw new Error(`TaskRun ${taskRunId} does not contain a replayable goal.`);
  }

  const rawTraces = await memoryStore.getRawTracesByTaskRun(taskRunId);
  const label = taskRun.dagNodeTitle || taskRun.goal.slice(0, 40) || taskRunId;

  return {
    taskRun,
    rawTraces,
    replayGoal,
    label,
  };
}
