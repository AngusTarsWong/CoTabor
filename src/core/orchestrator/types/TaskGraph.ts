import type { SchedulerRuntimeState } from "./SchedulerState";
import type { SubtaskDag, SubtaskOutputRef } from "./SubtaskDag";
import type { TaskGraphExecutionMode, TaskGraphResourceProfile } from "./TaskGraphPolicy";
import type { ReplanContext, ReplanDecision } from "../replanning/types";

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

export interface TaskGraphReplanningConfig {
  /** Enable mid-execution DAG replanning when a subtask fails (default: false). */
  enabled: boolean;
  /** Maximum number of replan cycles across the entire run (default: 2). */
  maxReplanAttempts?: number;
  /** Called after each replan decision for observability / UI updates. */
  onDecision?: (context: ReplanContext, decision: ReplanDecision) => void;
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
