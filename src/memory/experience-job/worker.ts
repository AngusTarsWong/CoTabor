import { memoryStore } from "../store/indexeddb";
import {
  TaskRunRecord,
  TaskMemoryCommitResult,
} from "../../shared/types/memory";
import { TaskMemoryClassifier } from "../task-commit/llm-classifier";
import { FormalMemoryWriter } from "../task-commit/formal-memory-writer";
import { emitExperienceJobEvent } from "./events";
import { ENV } from "../../shared/constants/env";
import { runExperienceSummaryUpdateStep } from "./summary-update-step";
import { runExperienceMemoryCommitStep } from "./memory-commit-step";

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
      const summaryStep = await runExperienceSummaryUpdateStep({
        taskRun,
        rawTraces,
      });

      return await runExperienceMemoryCommitStep({
        taskRunId,
        taskRun,
        runningTaskRun,
        rawTraces,
        startedAt,
        summaryStep,
        classifier: this.classifier,
        writer: this.writer,
      });
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
