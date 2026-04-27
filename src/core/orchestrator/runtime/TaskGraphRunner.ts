import type { SchedulerRuntimeState } from "../types/SchedulerState";
import type { SubtaskDag, SubtaskNode, SubtaskOutputRef } from "../types/SubtaskDag";
import type { TaskGraphRunResult, TaskGraphSubtaskResult, TaskGraphTaskInput } from "../types/TaskGraph";
import type { TaskGraphExecutionMode, TaskGraphPolicyDecision } from "../types/TaskGraphPolicy";
import { buildSubtaskDag } from "../planning/DependencyExtractor";
import { validateSubtaskDag } from "../planning/DagValidator";
import { DependencyScheduler } from "../scheduler/DependencyScheduler";
import { nextLaunchBatch } from "../scheduler/ReadyQueue";
import { resolveSharedTabPolicy } from "./TaskGraphPolicy";

export interface TaskGraphRoundInfo {
  round: number;
  launchIds: string[];
}

export interface TaskGraphRunnerConfig {
  goal: string;
  tasks: TaskGraphTaskInput[];
  maxParallelSubAgents?: number;
  executionMode?: TaskGraphExecutionMode;
  runIdPrefix?: string;
  executeSubtask: (node: SubtaskNode, dag: SubtaskDag) => Promise<TaskGraphSubtaskResult>;
  onRoundStart?: (info: TaskGraphRoundInfo) => void;
  onPolicyResolved?: (decision: TaskGraphPolicyDecision) => void;
}

function buildOutputRef(id: string, result: TaskGraphSubtaskResult): SubtaskOutputRef | undefined {
  if (result.outputRef) return result.outputRef;
  if (!result.success) return undefined;

  return {
    id: `output_${id}_${Date.now()}`,
    summary: result.summary,
    createdAt: Date.now(),
  };
}

export function extractTaskGraphSummary(finalState: any, fallbackSummary?: string): string | undefined {
  const candidates = [
    fallbackSummary,
    finalState?.planner_output?.action?.description,
    finalState?.planner_output?.action?.result,
    finalState?.output,
    finalState?.summary,
    finalState?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

export async function runTaskGraph(config: TaskGraphRunnerConfig): Promise<TaskGraphRunResult> {
  const policyDecision = resolveSharedTabPolicy({
    tasks: config.tasks,
    requestedExecutionMode: config.executionMode,
    requestedMaxParallelSubAgents: config.maxParallelSubAgents,
  });
  config.onPolicyResolved?.(policyDecision);

  const dag = buildSubtaskDag({ tasks: config.tasks });
  const validation = validateSubtaskDag(dag);

  if (!validation.valid) {
    throw new Error(`Task graph validation failed: ${validation.errors.join("; ")}`);
  }

  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;
  dag.hasCycle = false;

  const scheduler = new DependencyScheduler(
    dag,
    `${config.runIdPrefix ?? "scheduler"}_${Date.now()}`,
  );
  const maxParallel = Math.max(1, policyDecision.effectiveMaxParallelSubAgents || 2);
  const subtaskResults: Record<string, TaskGraphSubtaskResult> = {};
  let round = 0;

  while (true) {
    const launchIds = nextLaunchBatch(scheduler, maxParallel);
    if (launchIds.length === 0) {
      if (scheduler.isDone()) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }

    round += 1;
    config.onRoundStart?.({ round, launchIds });

    await Promise.all(
      launchIds.map(async (id) => {
        const node = scheduler.getDag().nodes[id];
        if (!node) return;

        const result = await config.executeSubtask(node, scheduler.getDag());
        const normalizedResult: TaskGraphSubtaskResult = {
          ...result,
          summary: extractTaskGraphSummary(result.finalState, result.summary),
        };
        subtaskResults[id] = normalizedResult;

        scheduler.markResult({
          id,
          success: normalizedResult.success,
          outputRef: buildOutputRef(id, normalizedResult),
          error: normalizedResult.success
            ? undefined
            : {
                code: "sub_agent_failed",
                message: normalizedResult.error || "Subtask failed",
                retryable: true,
              },
        });
      }),
    );

    if (scheduler.isDone()) {
      break;
    }
  }

  const schedulerRuntime: SchedulerRuntimeState = scheduler.getState();
  return {
    schedulerRuntime,
    subtaskDag: scheduler.getDag(),
    subtaskResults,
  };
}
