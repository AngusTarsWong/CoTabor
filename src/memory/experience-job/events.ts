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
    }
  | {
      type: "completed";
      taskRunId: string;
      goal: string;
      candidates: number;
      committed: { L1: number; L2: number; L3: number; DROP: number };
      synced: boolean;
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
