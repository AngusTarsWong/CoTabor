import type { SchedulerRuntimeState } from "./SchedulerState";
import type { SubtaskDag, SubtaskOutputRef } from "./SubtaskDag";
import type { TaskGraphExecutionMode, TaskGraphResourceProfile } from "./TaskGraphPolicy";

export interface TaskGraphTaskInput {
  id?: string;
  title?: string;
  goal?: string;
  description?: string;
  dependsOn?: string[];
  depends_on?: string[];
  maxAttempts?: number;
  resourceProfile?: TaskGraphResourceProfile;
  metadata?: Record<string, any>;
}

export interface TaskGraphSubtaskResult {
  success: boolean;
  finalState?: any;
  error?: string;
  summary?: string;
  taskRunId?: string;
  outputRef?: SubtaskOutputRef;
}

export interface TaskGraphRunResult {
  schedulerRuntime: SchedulerRuntimeState;
  subtaskDag: SubtaskDag;
  subtaskResults: Record<string, TaskGraphSubtaskResult>;
}

export interface TaskGraphLaunchPayload {
  mode?: "dag";
  goal: string;
  subtasks?: TaskGraphTaskInput[];
  tasks?: TaskGraphTaskInput[];
  maxParallelSubAgents?: number;
  executionMode?: TaskGraphExecutionMode;
}

export interface NormalizedLaunchRequest {
  mode: "single" | "dag";
  source: "plain_text" | "json" | "ai_plan";
  goal: string;
  subtasks?: TaskGraphTaskInput[];
  maxParallelSubAgents?: number;
  executionMode?: TaskGraphExecutionMode;
}
