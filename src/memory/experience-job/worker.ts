import { memoryStore } from "../store/indexeddb";
import { TaskRunRecord, TaskMemoryCommitResult } from "../../shared/types/memory";
import { summarizeTaskExperience } from "./summarizer";
import { extractMemoryCandidates } from "../task-commit/candidate-extractor";
import { TaskMemoryClassifier } from "../task-commit/llm-classifier";
import { FormalMemoryWriter } from "../task-commit/formal-memory-writer";
import { syncTaskRunToCloud } from "../task-commit/task-run-sync";
import { emitExperienceJobEvent } from "./events";

export class ExperienceJobWorker {
  private classifier = new TaskMemoryClassifier();
  private writer = new FormalMemoryWriter();

  async run(taskRunId: string): Promise<TaskMemoryCommitResult> {
    const taskRun = await memoryStore.getTaskRun(taskRunId);
    if (!taskRun) {
      throw new Error(`TaskRun not found: ${taskRunId}`);
    }

    const runningTaskRun: TaskRunRecord = {
      ...taskRun,
      experienceStatus: "RUNNING",
      experienceStartedAt: Date.now(),
      experienceError: undefined,
      updatedAt: Date.now(),
    };
    await memoryStore.putTaskRun(runningTaskRun);
    emitExperienceJobEvent({ type: "running", taskRunId, goal: taskRun.goal });

    try {
      const rawTraces = await memoryStore.getRawTracesByTaskRun(taskRunId);
      const totalHistory = rawTraces
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((trace) => trace.raw);

      const summary = await summarizeTaskExperience({
        total_history: totalHistory,
        status: taskRun.status,
        long_term_memory: { summary: taskRun.globalSummary || "" },
      });

      const finalState = {
        total_history: totalHistory,
        long_term_memory: { summary: summary.globalSummary || taskRun.globalSummary || "" },
        experience_buffer: summary.experienceBuffer,
        llm_payloads: summary.llmPayloads,
        meta_data: {
          url: taskRun.hostUrl,
          title: taskRun.hostTitle,
        },
        status: taskRun.status,
      };

      const candidates = extractMemoryCandidates({
        goal: taskRun.goal,
        finalState,
      });

      const result: TaskMemoryCommitResult = {
        taskRunId,
        taskRunSynced: false,
        scheduled: true,
        experienceStatus: "SUCCEEDED",
        candidates: candidates.length,
        committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
      };

      for (const candidate of candidates) {
        const { memory } = await this.classifier.classifyCandidate(candidate);
        const level = await this.writer.write(taskRun.goal, memory);
        result.committed[level] += 1;
      }

      const completedTaskRun: TaskRunRecord = {
        ...runningTaskRun,
        globalSummary: summary.globalSummary || runningTaskRun.globalSummary,
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

      try {
        const synced = await syncTaskRunToCloud(completedTaskRun);
        if (synced) {
          result.taskRunSynced = true;
          await memoryStore.putTaskRun({
            ...completedTaskRun,
            cloudSyncStatus: "synced",
            syncedAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      } catch (error: any) {
        await memoryStore.putTaskRun({
          ...completedTaskRun,
          cloudSyncStatus: "failed",
          cloudSyncError: error?.message || String(error),
          updatedAt: Date.now(),
        });
      }

      emitExperienceJobEvent({
        type: "completed",
        taskRunId,
        goal: taskRun.goal,
        candidates: result.candidates,
        committed: result.committed,
        synced: !!result.taskRunSynced,
      });

      return result;
    } catch (error: any) {
      const failedTaskRun: TaskRunRecord = {
        ...runningTaskRun,
        experienceStatus: "FAILED",
        experienceFinishedAt: Date.now(),
        experienceError: error?.message || String(error),
        experienceRetryCount: (runningTaskRun.experienceRetryCount || 0) + 1,
        updatedAt: Date.now(),
      };
      await memoryStore.putTaskRun(failedTaskRun);
      emitExperienceJobEvent({
        type: "failed",
        taskRunId,
        goal: taskRun.goal,
        error: failedTaskRun.experienceError || "Unknown error",
      });
      throw error;
    }
  }
}
