import type { SchedulerRuntimeState } from "../types/SchedulerState";
import type { SubtaskDag, SubtaskNode } from "../types/SubtaskDag";
import type {
  TaskGraphRunResult,
  TaskGraphSubtaskResult,
  TaskGraphTaskInput,
  TaskGraphReplanningConfig,
} from "../types/TaskGraph";
import type { TaskGraphExecutionMode, TaskGraphPolicyDecision } from "../types/TaskGraphPolicy";
import { buildSubtaskDag } from "../planning/DependencyExtractor";
import { validateSubtaskDag } from "../planning/DagValidator";
import { DependencyScheduler } from "../scheduler/DependencyScheduler";
import { nextLaunchBatch } from "../scheduler/ReadyQueue";
import { resolveSharedTabPolicy } from "./TaskGraphPolicy";
import { extractSubtaskOutput } from "./OutputExtractor";
import { replanAfterFailure } from "../replanning/OrchestratorReplanner";
import { patchDagWithReplan } from "../replanning/DagPatcher";
import type { ReplanContext } from "../replanning/types";

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
  replanning?: TaskGraphReplanningConfig;
  /** executeSubtask now accepts a snapshot of the cumulative notebook from predecessor nodes */
  executeSubtask: (node: SubtaskNode, dag: SubtaskDag, notebookSnapshot: Record<string, any>) => Promise<TaskGraphSubtaskResult>;
  onRoundStart?: (info: TaskGraphRoundInfo) => void;
  onPolicyResolved?: (decision: TaskGraphPolicyDecision) => void;
  shouldStop?: () => boolean;
}

/**
 * Legacy summary extractor for backward compatibility with UI components.
 */
export function extractTaskGraphSummary(finalState: any, fallbackSummary?: string): string | undefined {
  if (fallbackSummary?.trim()) return fallbackSummary.trim();
  return extractSubtaskOutput(finalState).summary ?? "";
}

/**
 * Handles a failed subtask: marks it in the scheduler, then — if replanning is
 * enabled and there are blocked descendants — calls the LLM replanner and
 * patches the live DAG accordingly.
 */
async function handleFailedSubtask(
  id: string,
  result: TaskGraphSubtaskResult,
  scheduler: DependencyScheduler,
  goal: string,
  replanning: TaskGraphReplanningConfig,
  replanCount: { value: number },
  subtaskResults: Record<string, TaskGraphSubtaskResult>,
): Promise<void> {
  const { blockedDescendants } = scheduler.markResult({
    id,
    success: false,
    error: {
      code: "sub_agent_failed",
      message: result.error || "Subtask failed",
      retryable: true,
    },
  });

  const maxReplanAttempts = replanning.maxReplanAttempts ?? 2;
  const shouldReplan =
    replanning.enabled &&
    blockedDescendants.length > 0 &&
    replanCount.value < maxReplanAttempts;

  if (!shouldReplan) return;

  replanCount.value += 1;

  const dag = scheduler.getDag();
  const failedNode = dag.nodes[id];

  const context: ReplanContext = {
    originalGoal: goal,
    completedNodes: scheduler.getState().completed.map((cId) => {
      const node = dag.nodes[cId];
      return { id: cId, title: node?.title ?? cId, summary: node?.outputRef?.summary };
    }),
    failedNode: {
      id,
      title: failedNode?.title ?? id,
      error: result.error ?? "Unknown error",
      attempt: failedNode?.attempt ?? 1,
    },
    blockedNodes: blockedDescendants.map((bId) => {
      const node = dag.nodes[bId];
      return { id: bId, title: node?.title ?? bId, description: node?.description };
    }),
  };

  const { decision } = await replanAfterFailure(context);
  replanning.onDecision?.(context, decision);

  if (decision.action === "replace_blocked") {
    patchDagWithReplan(blockedDescendants, decision.newNodes, scheduler);
  } else if (decision.action === "abort") {
    throw new Error(`[Replanner] 终止执行：${decision.reason}`);
  }
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
  
  // Initialize the cumulative global notebook for data handoffs
  let globalNotebook: Record<string, any> = {};
  
  const maxParallel = Math.max(1, policyDecision.effectiveMaxParallelSubAgents || 2);
  const subtaskResults: Record<string, TaskGraphSubtaskResult> = {};
  const replanCount = { value: 0 };
  let round = 0;

  while (true) {
    if (config.shouldStop?.()) {
      break;
    }

    const launchIds = nextLaunchBatch(scheduler, maxParallel);
    if (launchIds.length === 0) {
      if (scheduler.isDone()) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }

    if (config.shouldStop?.()) {
      break;
    }

    round += 1;
    config.onRoundStart?.({ round, launchIds });

    await Promise.all(
      launchIds.map(async (id) => {
        if (config.shouldStop?.()) {
          return;
        }

        const node = scheduler.getDag().nodes[id];
        if (!node) return;

        // Pass a snapshot of the current cumulative notebook to the sub-agent
        const result = await config.executeSubtask(node, scheduler.getDag(), { ...globalNotebook });
        
        const extractedOutput = extractSubtaskOutput(result.finalState);
        const normalizedSummary = result.summary?.trim() || extractedOutput.summary || "";
        const normalizedResult: TaskGraphSubtaskResult = {
          ...result,
          summary: normalizedSummary,
          outputRef: result.outputRef ?? {
            id: `${id}_output`,
            summary: normalizedSummary,
            payload: extractedOutput.payload,
            payloadType: extractedOutput.payloadType,
            createdAt: Date.now(),
          },
        };
        subtaskResults[id] = normalizedResult;

        if (normalizedResult.success) {
          // Merge sub-agent's notebook findings into the global notebook
          const agentNotebook = result.finalState?.long_term_memory?.notebook;
          if (agentNotebook && typeof agentNotebook === 'object') {
            globalNotebook = { ...globalNotebook, ...agentNotebook };
          }

          scheduler.markResult({
            id,
            success: true,
            outputRef: normalizedResult.outputRef, 
          });
          return;
        }

        await handleFailedSubtask(
          id,
          normalizedResult,
          scheduler,
          config.goal,
          config.replanning ?? { enabled: false },
          replanCount,
          subtaskResults,
        );
      }),
    );

    if (scheduler.isDone()) {
      break;
    }

    if (config.shouldStop?.()) {
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
