import {
  CommittedMemoryDetail,
  ExperienceSyncDetails,
  TaskExperienceBuffer,
} from "../../shared/types/memory";

export type ExperienceJobPhase = "queued" | "summarizing" | "classifying" | "syncing";

export interface ExperienceJobLiveStatusSnapshot {
  phase: ExperienceJobPhase;
  startedAt?: number;
  updatedAt: number;
  currentModel?: string;
  currentStepTitle?: string;
  candidateCountSoFar?: number;
  committedCountsSoFar?: { L1: number; L2: number; L3: number; DROP: number };
  syncProgress?: string;
  lastMessage?: string;
}

export type ExperienceJobEvent =
  | {
      type: "queued";
      taskRunId: string;
      goal: string;
    }
  | {
      type: "running";
      taskRunId: string;
      goal: string;
      liveStatusSnapshot: ExperienceJobLiveStatusSnapshot;
    }
  | {
      type: "completed";
      taskRunId: string;
      goal: string;
      globalSummary?: string;
      experienceBuffer?: TaskExperienceBuffer;
      rawResponse?: string;
      candidates: number;
      committed: { L1: number; L2: number; L3: number; DROP: number };
      committedMemories?: CommittedMemoryDetail[];
      syncDetails?: ExperienceSyncDetails;
    }
  | {
      type: "failed";
      taskRunId: string;
      goal: string;
      error: string;
    };

export const experienceJobEventTarget = new EventTarget();

export function emitExperienceJobEvent(event: ExperienceJobEvent) {
  experienceJobEventTarget.dispatchEvent(
    new CustomEvent<ExperienceJobEvent>("experience-job", { detail: event })
  );
}
