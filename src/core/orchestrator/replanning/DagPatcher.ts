import type { SubtaskNode } from "../types/SubtaskDag";
import type { DependencyScheduler } from "../scheduler/DependencyScheduler";
import type { TaskGraphTaskInput } from "../types/TaskGraph";

/**
 * Cancels blocked nodes and injects replacement nodes into the live DAG and
 * scheduler so execution can resume without a full restart.
 *
 * Steps:
 * 1. Mark each blocked node as "cancelled" (removes it from scheduling).
 * 2. Build new SubtaskNodes from the replanner's output.
 * 3. Inject them into the scheduler (DAG + indegree + readyQueue).
 */
export function patchDagWithReplan(
  blockedIds: string[],
  newTaskInputs: TaskGraphTaskInput[],
  scheduler: DependencyScheduler,
): void {
  // Cancel all blocked nodes so they no longer gate anything.
  scheduler.cancelNodes(blockedIds);

  if (newTaskInputs.length === 0) return;

  const dag = scheduler.getDag();

  const newNodes: SubtaskNode[] = newTaskInputs.map((input, index) => {
    const id = input.id ?? `replan_${Date.now()}_${index}`;
    const dependsOn = Array.isArray(input.dependsOn)
      ? input.dependsOn.filter((depId) => {
          const dep = dag.nodes[depId];
          // Only allow referencing nodes that actually succeeded.
          return dep?.status === "succeeded";
        })
      : [];

    return {
      id,
      title: input.title ?? id,
      description: input.description,
      dependsOn,
      status: "pending",
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 2,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.resourceProfile ? { resourceProfile: input.resourceProfile } : {}),
        replanSource: "orchestrator_replanner",
      },
    };
  });

  scheduler.injectNodes(newNodes);
}
