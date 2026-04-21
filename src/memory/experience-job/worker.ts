import { memoryStore } from "../store/indexeddb";
import {
  TaskRunRecord,
  TaskMemoryCommitResult,
} from "../../shared/types/memory";
import { summarizeTaskExperience } from "./summarizer";
import { extractMemoryCandidatesFromTaskArtifacts } from "../task-commit/candidate-extractor";
import { TaskMemoryClassifier } from "../task-commit/llm-classifier";
import { FormalMemoryWriter } from "../task-commit/formal-memory-writer";
import { syncTaskRunToCloud } from "../task-commit/task-run-sync";
import { syncRawTracesToCloud } from "../task-commit/raw-trace-sync";
import { emitExperienceJobEvent } from "./events";
import { applyMemoryRefToRawTraces } from "../task-commit/raw-trace-memory-linker";
import { ENV } from "../../shared/constants/env";
import { buildExperienceSyncDetails } from "../task-commit/experience-sync-details-builder";

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
    const startedAt = Date.now();
    emitExperienceJobEvent({
      type: "running",
      taskRunId,
      goal: taskRun.goal,
      liveStatusSnapshot: {
        phase: "summarizing",
        startedAt,
        updatedAt: startedAt,
        currentModel: ENV.PLANNER_CONFIG.modelName,
        currentStepTitle: "经验总结",
        lastMessage: "正在基于 raw_trace 总结候选经验",
      },
    });

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

      const candidates = extractMemoryCandidatesFromTaskArtifacts({
        goal: taskRun.goal,
        finalState,
      }, rawTraces);

      emitExperienceJobEvent({
        type: "running",
        taskRunId,
        goal: taskRun.goal,
        liveStatusSnapshot: {
          phase: "classifying",
          startedAt,
          updatedAt: Date.now(),
          currentModel: ENV.PLANNER_CONFIG.modelName,
          currentStepTitle: "记忆分类与提交",
          candidateCountSoFar: candidates.length,
          committedCountsSoFar: { L1: 0, L2: 0, L3: 0, DROP: 0 },
          lastMessage: candidates.length > 0 ? "正在分类并提交正式记忆" : "未提炼出可提交的候选经验",
        },
      });

      const result: TaskMemoryCommitResult = {
        taskRunId,
        taskRunSynced: false,
        scheduled: true,
        experienceStatus: "SUCCEEDED",
        candidates: candidates.length,
        committedMemories: [],
        syncDetails: {
          taskRuns: { status: "pending" },
          rawTraces: { status: "pending", syncedCount: 0, failedCount: 0, pendingCount: rawTraces.length },
          notionSync: { status: "pending" },
        },
        committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
      };

      let enrichedRawTraces = rawTraces;

      for (const candidate of candidates) {
        const { memory } = await this.classifier.classifyCandidate(candidate);
        const writeResult = await this.writer.write(taskRun.goal, memory);
        result.committed[writeResult.level] += 1;
        if (writeResult.ref?.memoryText) {
          result.committedMemories?.push({
            id: writeResult.ref.id,
            level: writeResult.ref.level,
            title: writeResult.ref.title,
            memoryText: writeResult.ref.memoryText,
          });
        }
        enrichedRawTraces = applyMemoryRefToRawTraces(enrichedRawTraces, candidate, writeResult.ref);
        emitExperienceJobEvent({
          type: "running",
          taskRunId,
          goal: taskRun.goal,
          liveStatusSnapshot: {
            phase: "classifying",
            startedAt,
            updatedAt: Date.now(),
            currentModel: this.classifier.getModelName(),
            currentStepTitle: "记忆分类与提交",
            candidateCountSoFar: candidates.length,
            committedCountsSoFar: { ...result.committed },
            lastMessage: `已完成 ${Math.max(
              result.committed.L1 + result.committed.L2 + result.committed.L3 + result.committed.DROP,
              0
            )} / ${candidates.length} 条候选经验处理`,
          },
        });
      }

      await memoryStore.putRawTraces(enrichedRawTraces);

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
        emitExperienceJobEvent({
          type: "running",
          taskRunId,
          goal: taskRun.goal,
          liveStatusSnapshot: {
            phase: "syncing",
            startedAt,
            updatedAt: Date.now(),
            currentStepTitle: "同步到 Notion",
            candidateCountSoFar: result.candidates,
            committedCountsSoFar: { ...result.committed },
            syncProgress: "正在同步 TaskRuns / RawTraces",
            lastMessage: "正在把任务摘要与原始轨迹同步到云端",
          },
        });
        const synced = await syncTaskRunToCloud(completedTaskRun);
        result.syncDetails!.taskRuns = synced
          ? { status: "synced" }
          : { status: "pending" };

        const rawTraceSynced = synced ? await syncRawTracesToCloud(taskRunId) : false;
        result.syncDetails = await buildExperienceSyncDetails(taskRunId, result.committedMemories);

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
        result.syncDetails = await buildExperienceSyncDetails(taskRunId, result.committedMemories);
      }

      emitExperienceJobEvent({
        type: "completed",
        taskRunId,
        goal: taskRun.goal,
        globalSummary: summary.globalSummary,
        experienceBuffer: summary.experienceBuffer,
        rawResponse:
          typeof summary.llmPayloads?.[summary.llmPayloads.length - 1]?.response === "string"
            ? summary.llmPayloads[summary.llmPayloads.length - 1].response
            : "",
        candidates: result.candidates,
        committed: result.committed,
        committedMemories: result.committedMemories,
        syncDetails: result.syncDetails,
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
