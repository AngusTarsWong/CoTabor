import { memoryStore } from "../store/indexeddb";
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from "../../shared/types/memory";
import { extractMemoryCandidates } from "./candidate-extractor";
import { TaskMemoryClassifier } from "./llm-classifier";
import { FormalMemoryWriter } from "./formal-memory-writer";
import { buildRawTraces } from "./raw-trace-builder";
import { syncTaskRunToCloud } from "./task-run-sync";

export class TaskMemoryCommitter {
  private classifier: TaskMemoryClassifier;
  private writer: FormalMemoryWriter;

  constructor() {
    this.classifier = new TaskMemoryClassifier();
    this.writer = new FormalMemoryWriter();
  }

  async commit(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    const taskRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const totalHistory = input.finalState.total_history || [];
    const rawTraces = buildRawTraces(taskRunId, totalHistory);
    await memoryStore.putRawTraces(rawTraces);

    const candidates = extractMemoryCandidates(input);
    const result: TaskMemoryCommitResult = {
      taskRunId,
      taskRunSynced: false,
      candidates: candidates.length,
      committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
    };

    for (const candidate of candidates) {
      const { memory } = await this.classifier.classifyCandidate(candidate);
      const level = await this.writer.write(input.goal, memory);
      result.committed[level] += 1;
    }

    const now = Date.now();
    const taskRun = {
      id: taskRunId,
      goal: input.goal,
      status: input.finalState.status || "UNKNOWN",
      startedAt: totalHistory[0]?.ts || now,
      finishedAt: now,
      hostUrl: input.finalState.meta_data?.url,
      hostTitle: input.finalState.meta_data?.title,
      globalSummary: input.finalState.long_term_memory?.summary || "",
      traceCount: rawTraces.length,
      candidateCount: result.candidates,
      committedL1: result.committed.L1,
      committedL2: result.committed.L2,
      committedL3: result.committed.L3,
      droppedCount: result.committed.DROP,
      localPersistStatus: "saved" as const,
      cloudSyncStatus: "pending" as const,
      updatedAt: now,
    };

    await memoryStore.putTaskRun(taskRun);

    try {
      const synced = await syncTaskRunToCloud(taskRun);
      if (synced) {
        result.taskRunSynced = true;
        await memoryStore.putTaskRun({
          ...taskRun,
          cloudSyncStatus: "synced",
          syncedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (error: any) {
      await memoryStore.putTaskRun({
        ...taskRun,
        cloudSyncStatus: "failed",
        cloudSyncError: error?.message || String(error),
        updatedAt: Date.now(),
      });
    }

    return result;
  }
}
