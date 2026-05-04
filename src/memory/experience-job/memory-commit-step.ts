import { memoryStore } from "../store/indexeddb";
import {
  ClassifiedMemory,
  MemoryCandidate,
  RawTraceRecord,
  TaskMemoryCommitResult,
  TaskRunRecord,
} from "../../shared/types/memory";
import type { TokenUsage } from "../../shared/utils/llm-stream";
import { extractMemoryCandidatesFromTaskArtifacts } from "../task-commit/candidate-extractor";
import { syncTaskRunToCloud } from "../task-commit/task-run-sync";
import { syncRawTracesToCloud } from "../task-commit/raw-trace-sync";
import { emitExperienceJobEvent } from "./events";
import { applyMemoryRefToRawTraces } from "../task-commit/raw-trace-memory-linker";
import { ENV } from "../../shared/constants/env";
import { buildExperienceSyncDetails } from "../task-commit/experience-sync-details-builder";
import type { ExperienceSummaryUpdateStepResult } from "./summary-update-step";
import type { TaskMemoryClassifier } from "../task-commit/llm-classifier";
import type { FormalMemoryWriter } from "../task-commit/formal-memory-writer";

/**
 * For a successfully completed task, find all L3 memories that were retrieved together
 * and strengthen (or create) a `co_occurs` edge between each pair.
 * Runs fire-and-forget — never blocks the main commit flow.
 */
async function strengthenCoOccurrenceEdges(taskRunId: string): Promise<void> {
  try {
    const attributions = await memoryStore.getAttributionsByTaskRun(taskRunId);
    const l3Ids = attributions
      .filter(a => a.memoryLevel === "L3")
      .map(a => a.memoryId);

    if (l3Ids.length < 2) return;

    const tasks: Promise<void>[] = [];
    for (let i = 0; i < l3Ids.length; i++) {
      for (let j = i + 1; j < l3Ids.length; j++) {
        tasks.push(memoryStore.upsertCoOccurrenceEdge(l3Ids[i], l3Ids[j]));
      }
    }
    await Promise.allSettled(tasks);
  } catch (e) {
    console.warn("[ExperienceJobWorker] Co-occurrence edge update failed (non-critical):", e);
  }
}

function createInitialCommitResult(taskRunId: string, rawTraceCount: number): TaskMemoryCommitResult {
  return {
    taskRunId,
    taskRunSynced: false,
    scheduled: true,
    experienceStatus: "SUCCEEDED",
    candidates: 0,
    committedMemories: [],
    syncDetails: {
      taskRuns: { status: "pending" },
      rawTraces: {
        status: "pending",
        syncedCount: 0,
        failedCount: 0,
        pendingCount: rawTraceCount,
      },
      notionSync: { status: "pending" },
    },
    committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
  };
}

async function classifyCandidates(
  classifier: Pick<TaskMemoryClassifier, "classifyCandidate">,
  candidates: MemoryCandidate[],
): Promise<Array<{
  memory: { memory: ClassifiedMemory; tokenUsage: TokenUsage };
  candidate: MemoryCandidate;
}>> {
  const classifyOutcomes = await Promise.allSettled(
    candidates.map((candidate) => classifier.classifyCandidate(candidate))
  );

  const classifiedPairs: Array<{
    memory: { memory: ClassifiedMemory; tokenUsage: TokenUsage };
    candidate: MemoryCandidate;
  }> = [];

  for (let i = 0; i < classifyOutcomes.length; i++) {
    const outcome = classifyOutcomes[i];
    if (outcome.status === "fulfilled") {
      classifiedPairs.push({ memory: outcome.value, candidate: candidates[i] });
    }
  }

  return classifiedPairs;
}

async function writeClassifiedMemories(input: {
  taskRunId: string;
  goal: string;
  startedAt: number;
  classifier: Pick<TaskMemoryClassifier, "getModelName">;
  writer: Pick<FormalMemoryWriter, "write">;
  classifiedPairs: Array<{
    memory: { memory: ClassifiedMemory; tokenUsage: TokenUsage };
    candidate: MemoryCandidate;
  }>;
  rawTraces: RawTraceRecord[];
  result: TaskMemoryCommitResult;
}): Promise<RawTraceRecord[]> {
  let enrichedRawTraces = input.rawTraces;

  for (const { memory, candidate } of input.classifiedPairs) {
    const writeResult = await input.writer.write(input.goal, memory.memory);
    input.result.committed[writeResult.level] += 1;
    if (writeResult.ref?.memoryText) {
      input.result.committedMemories?.push({
        id: writeResult.ref.id,
        level: writeResult.ref.level,
        title: writeResult.ref.title,
        memoryText: writeResult.ref.memoryText,
      });
    }
    enrichedRawTraces = applyMemoryRefToRawTraces(enrichedRawTraces, candidate, writeResult.ref);
    emitExperienceJobEvent({
      type: "running",
      taskRunId: input.taskRunId,
      goal: input.goal,
      liveStatusSnapshot: {
        phase: "classifying",
        startedAt: input.startedAt,
        updatedAt: Date.now(),
        currentModel: input.classifier.getModelName(),
        currentStepTitle: "记忆分类与提交",
        candidateCountSoFar: input.result.candidates,
        committedCountsSoFar: { ...input.result.committed },
        lastMessage: `已写入 ${Math.max(
          input.result.committed.L1 +
            input.result.committed.L2 +
            input.result.committed.L3 +
            input.result.committed.DROP,
          0
        )} / ${input.classifiedPairs.length} 条分类记忆`,
      },
    });
  }

  return enrichedRawTraces;
}

export async function runExperienceMemoryCommitStep(input: {
  taskRunId: string;
  taskRun: TaskRunRecord;
  runningTaskRun: TaskRunRecord;
  rawTraces: RawTraceRecord[];
  startedAt: number;
  summaryStep: ExperienceSummaryUpdateStepResult;
  classifier: Pick<TaskMemoryClassifier, "classifyCandidate" | "getModelName">;
  writer: Pick<FormalMemoryWriter, "write">;
}): Promise<TaskMemoryCommitResult> {
  const result = createInitialCommitResult(input.taskRunId, input.rawTraces.length);
  const candidates = extractMemoryCandidatesFromTaskArtifacts(
    {
      goal: input.taskRun.goal,
      finalState: input.summaryStep.finalState,
    },
    input.rawTraces
  );
  result.candidates = candidates.length;

  emitExperienceJobEvent({
    type: "running",
    taskRunId: input.taskRunId,
    goal: input.taskRun.goal,
    liveStatusSnapshot: {
      phase: "classifying",
      startedAt: input.startedAt,
      updatedAt: Date.now(),
      currentModel: ENV.PLANNER_CONFIG.modelName,
      currentStepTitle: "记忆分类与提交",
      candidateCountSoFar: candidates.length,
      committedCountsSoFar: { L1: 0, L2: 0, L3: 0, DROP: 0 },
      lastMessage: candidates.length > 0
        ? `正在并行分类 ${candidates.length} 条候选经验`
        : "未提炼出可提交的候选经验",
    },
  });

  const classifiedPairs = await classifyCandidates(input.classifier, candidates);
  const enrichedRawTraces = await writeClassifiedMemories({
    taskRunId: input.taskRunId,
    goal: input.taskRun.goal,
    startedAt: input.startedAt,
    classifier: input.classifier,
    writer: input.writer,
    classifiedPairs,
    rawTraces: input.rawTraces,
    result,
  });

  await memoryStore.putRawTraces(enrichedRawTraces);

  const completedTaskRun: TaskRunRecord = {
    ...input.runningTaskRun,
    globalSummary: input.summaryStep.resolvedGlobalSummary,
    candidateCount: result.candidates,
    committedL1: result.committed.L1,
    committedL2: result.committed.L2,
    committedL3: result.committed.L3,
    droppedCount: result.committed.DROP,
    experienceStatus: "SUCCEEDED",
    experienceFinishedAt: Date.now(),
    cloudSyncStatus: "pending",
    updatedAt: Date.now(),
  };
  await memoryStore.putTaskRun(completedTaskRun);

  const taskOutcome = input.taskRun.status === "FINISHED" ? "FINISHED" : "FAILED";
  void memoryStore.updateAttributionOutcome(input.taskRunId, taskOutcome);
  if (input.taskRun.status === "FINISHED") {
    void strengthenCoOccurrenceEdges(input.taskRunId);
  }

  try {
    emitExperienceJobEvent({
      type: "running",
      taskRunId: input.taskRunId,
      goal: input.taskRun.goal,
      liveStatusSnapshot: {
        phase: "syncing",
        startedAt: input.startedAt,
        updatedAt: Date.now(),
        currentStepTitle: "同步到 Notion",
        candidateCountSoFar: result.candidates,
        committedCountsSoFar: { ...result.committed },
        syncProgress: "正在同步 TaskRuns / RawTraces",
        lastMessage: "正在把任务摘要与原始轨迹同步到云端",
      },
    });
    const synced = await syncTaskRunToCloud(completedTaskRun);
    result.syncDetails!.taskRuns = synced ? { status: "synced" } : { status: "pending" };

    const rawTraceSynced = synced ? await syncRawTracesToCloud(input.taskRunId) : false;
    result.syncDetails = await buildExperienceSyncDetails(input.taskRunId, result.committedMemories);

    if (synced && rawTraceSynced) {
      result.taskRunSynced = true;
      await memoryStore.putTaskRun({
        ...completedTaskRun,
        cloudSyncStatus: "synced",
        syncedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  } catch (error: any) {
    const message = error?.message || String(error);
    await memoryStore.putTaskRun({
      ...completedTaskRun,
      cloudSyncStatus: "failed",
      cloudSyncError: message,
      updatedAt: Date.now(),
    });
    result.syncDetails = await buildExperienceSyncDetails(input.taskRunId, result.committedMemories);
  }

  emitExperienceJobEvent({
    type: "completed",
    taskRunId: input.taskRunId,
    goal: input.taskRun.goal,
    globalSummary: input.summaryStep.resolvedGlobalSummary,
    experienceBuffer: input.summaryStep.summary.experienceBuffer,
    rawResponse:
      typeof input.summaryStep.summary.llmPayloads?.[input.summaryStep.summary.llmPayloads.length - 1]?.response ===
      "string"
        ? input.summaryStep.summary.llmPayloads[input.summaryStep.summary.llmPayloads.length - 1].response
        : "",
    candidates: result.candidates,
    committed: result.committed,
    committedMemories: result.committedMemories,
    syncDetails: result.syncDetails,
  });

  return result;
}
