import type { TaskGraphTaskInput } from "../types/TaskGraph";
import type {
  TaskGraphExecutionMode,
  TaskGraphPolicyDecision,
  TaskGraphResourceProfile,
} from "../types/TaskGraphPolicy";

export interface SharedTabPolicyInput {
  tasks: TaskGraphTaskInput[];
  requestedExecutionMode?: TaskGraphExecutionMode;
  requestedMaxParallelSubAgents?: number;
}

function normalizeResourceProfile(task: TaskGraphTaskInput): TaskGraphResourceProfile {
  if (task.resourceProfile) {
    return task.resourceProfile;
  }

  const metadataProfile = task.metadata?.resourceProfile;
  if (typeof metadataProfile === "string") {
    return metadataProfile as TaskGraphResourceProfile;
  }

  return "skill_only";
}

function countPageSensitiveTasks(tasks: TaskGraphTaskInput[]): number {
  return tasks.filter((task) => {
    const profile = normalizeResourceProfile(task);
    return profile === "page_read" || profile === "page_write";
  }).length;
}

function hasParallelRoots(tasks: TaskGraphTaskInput[]): boolean {
  const rootTasks = tasks.filter((task) => {
    const dependsOn = task.dependsOn ?? task.depends_on ?? [];
    return dependsOn.length === 0;
  });
  return rootTasks.length > 1;
}

export function resolveSharedTabPolicy(input: SharedTabPolicyInput): TaskGraphPolicyDecision {
  const requestedMode = input.requestedExecutionMode ?? "shared_tab";
  if (requestedMode === "isolated_tabs") {
    return {
      executionMode: "isolated_tabs",
      effectiveMaxParallelSubAgents: Math.max(1, input.requestedMaxParallelSubAgents ?? 2),
      warnings: [],
    };
  }

  const pageSensitiveTasks = countPageSensitiveTasks(input.tasks);
  const requestedParallel = Math.max(1, input.requestedMaxParallelSubAgents ?? 2);

  if (requestedMode === "single_page_serial") {
    return {
      executionMode: "single_page_serial",
      effectiveMaxParallelSubAgents: 1,
      warnings:
        requestedParallel > 1
          ? [{
              code: "parallelism_downgraded",
              message: "single_page_serial mode forces maxParallelSubAgents=1.",
            }]
          : [],
    };
  }

  if (pageSensitiveTasks === 0) {
    return {
      executionMode: "shared_tab",
      effectiveMaxParallelSubAgents: requestedParallel,
      warnings: [],
    };
  }

  if (requestedParallel > 1 && hasParallelRoots(input.tasks)) {
    throw new Error(
      "Shared-tab DAG cannot run page-sensitive tasks in parallel. Mark this flow as single_page_serial or wait for isolated_tabs runtime.",
    );
  }

  return {
    executionMode: "single_page_serial",
    effectiveMaxParallelSubAgents: 1,
    warnings: [{
      code: "shared_tab_serialized",
      message: "Page-sensitive DAG was downgraded to single_page_serial to avoid tab contention.",
    }],
  };
}
