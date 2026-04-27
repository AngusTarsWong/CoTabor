export interface SchedulerRuntimeState {
  runId: string;
  readyQueue: string[];
  running: string[];
  completed: string[];
  failed: string[];
  blocked: string[];
  cancelRequested: boolean;
  paused: boolean;
  updatedAt: number;
}

export interface SchedulerDecision {
  launch: string[];
  done: boolean;
}
