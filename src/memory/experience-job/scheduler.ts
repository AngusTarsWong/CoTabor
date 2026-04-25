import { memoryStore } from "../store/indexeddb";
import { TaskMemoryCommitInput, TaskMemoryCommitResult, TaskRunRecord } from "../../shared/types/memory";
import { buildRawTraces } from "../task-commit/raw-trace-builder";
import { emitExperienceJobEvent } from "./events";
import { ExperienceJobWorker } from "./worker";

const runningTaskIds = new Set<string>();

function buildTaskRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function extractInitialSummary(input: TaskMemoryCommitInput): string {
  const action = input.finalState?.planner_output?.action;
  if (typeof action?.result === "string" && action.result.trim()) {
    return action.result.trim();
  }
  if (typeof input.finalState?.long_term_memory?.summary === "string") {
    return input.finalState.long_term_memory.summary;
  }
  return "";
}

function extractFinishedAt(totalHistory: any[]): number {
  const lastStep = totalHistory[totalHistory.length - 1];
  return Number(lastStep?.ts || lastStep?.meta?.timestamp || Date.now());
}

async function startBackgroundRun(taskRunId: string) {
  if (runningTaskIds.has(taskRunId)) return;
  runningTaskIds.add(taskRunId);
  const worker = new ExperienceJobWorker();
  try {
    await worker.run(taskRunId);
  } catch (error) {
    console.warn(`[ExperienceJobScheduler] Background experience job failed for ${taskRunId}:`, error);
  } finally {
    runningTaskIds.delete(taskRunId);
  }
}

export class ExperienceJobScheduler {
  async schedule(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    const totalHistory = input.finalState.total_history || [];
    if (totalHistory.length === 0) {
      return {
        scheduled: false,
        candidates: 0,
        committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
      };
    }

    // Prefer the ID pre-generated in agent.ts so memory attribution records written during
    // graph execution already carry the correct taskRunId.  Fall back to generating a new ID
    // for callers that don't supply one (e.g. unit tests, legacy integrations).
    const taskRunId = input.finalState.task_run_id || buildTaskRunId();
    const rawTraces = buildRawTraces(taskRunId, totalHistory);
    await memoryStore.putRawTraces(rawTraces);

    const now = Date.now();
    const taskRun: TaskRunRecord = {
      id: taskRunId,
      goal: input.goal,
      status: input.finalState.status || "UNKNOWN",
      startedAt: Number(totalHistory[0]?.ts || totalHistory[0]?.meta?.timestamp || now),
      finishedAt: extractFinishedAt(totalHistory),
      hostUrl: input.finalState.meta_data?.url,
      hostTitle: input.finalState.meta_data?.title,
      globalSummary: extractInitialSummary(input),
      traceCount: rawTraces.length,
      candidateCount: 0,
      committedL1: 0,
      committedL2: 0,
      committedL3: 0,
      droppedCount: 0,
      localPersistStatus: "saved",
      experienceStatus: "PENDING",
      experienceRetryCount: 0,
      cloudSyncStatus: "pending",
      updatedAt: now,
    };

    await memoryStore.putTaskRun(taskRun);
    emitExperienceJobEvent({ type: "queued", taskRunId, goal: input.goal });
    void startBackgroundRun(taskRunId);

    return {
      taskRunId,
      taskRunSynced: false,
      scheduled: true,
      experienceStatus: "PENDING",
      candidates: 0,
      committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
    };
  }

  async schedulePendingRuns(): Promise<void> {
    const pendingRuns = await memoryStore.getPendingExperienceTaskRuns();
    for (const taskRun of pendingRuns) {
      if (taskRun.experienceStatus === "FAILED" && taskRun.experienceRetryCount >= 3) {
        continue;
      }
      void startBackgroundRun(taskRun.id);
    }
  }
}

export const experienceJobScheduler = new ExperienceJobScheduler();
