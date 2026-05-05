import { AgentConfig } from '../../../lib/claw/agent';
import { ENV } from '../../../shared/constants/env';
import { persistDagNodeExecution } from '../../../memory/task-commit/dag-node-persistence';
import { buildSubtaskDag } from '../planning/DependencyExtractor';
import { validateSubtaskDag } from '../planning/DagValidator';
import { runSubAgentTask } from '../runtime/SubAgentRunner';
import { ChromeSandboxTabDriver } from '../runtime/ChromeSandboxTabDriver';
import { SandboxTabAllocator } from '../runtime/SandboxTabAllocator';
import { resolveDagRunOutcome } from '../runtime/DagResultResolver';
import { extractTaskGraphSummary, runTaskGraph } from '../runtime/TaskGraphRunner';
import type { SubtaskNode } from '../types/SubtaskDag';
import type { TaskGraphSubtaskResult } from '../types/TaskGraph';
import type { SandboxRuntimeSnapshot, SubAgentRuntimeSnapshot } from '../types/ResourceRuntime';
import { runSingleAgentOnTab } from './SingleAgentMode';

export function shouldUseScheduler(config: AgentConfig): boolean {
  return Boolean(ENV.MULTI_AGENT_SCHEDULER && config.subtasks && config.subtasks.length > 0);
}

async function ensureSandboxAllocation(
  config: AgentConfig,
  node: SubtaskNode,
  currentAllocator: SandboxTabAllocator | null,
  setAllocator: (allocator: SandboxTabAllocator) => void,
) {
  let allocator = currentAllocator;
  if (!allocator) {
    allocator = new SandboxTabAllocator({
      taskName: config.goal,
      sourceTabId: config.tabId,
      driver: config.sandboxTabDriver ?? new ChromeSandboxTabDriver(),
    });
    setAllocator(allocator);
  }

  const assignment = await allocator.allocate(node);
  config.onResourceRuntimeUpdate?.(allocator.getSnapshot());
  config.onResourceRuntimeUpdate?.({ ...allocator.getSnapshot(), agents: [], updatedAt: Date.now() });
  return assignment;
}

export async function runWithDependencyScheduler(
  config: AgentConfig,
  activeAgents: Map<number, import('../../../lib/claw/agent').ClawAgent>,
): Promise<void> {
  const rawSubtasks = config.subtasks || [];
  const validationPreview = validateSubtaskDag(buildSubtaskDag({ tasks: rawSubtasks }));
  if (!validationPreview.valid) {
    await runSingleAgentOnTab(config, activeAgents);
    return;
  }

  if (config.executionMode !== "isolated_tabs") {
    config.onResourceRuntimeUpdate?.(null);
  }

  let sandboxAllocator: SandboxTabAllocator | null = null;
  const subAgentSnapshots = new Map<string, SubAgentRuntimeSnapshot>();
  let resolvedExecutionMode = config.executionMode ?? "shared_tab";
  let effectiveMaxParallelSubAgents = Math.max(1, config.maxParallelSubAgents ?? 2);
  const dagRunId = `dag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const getSandboxSnapshot = (): SandboxRuntimeSnapshot =>
    sandboxAllocator ? sandboxAllocator.getSnapshot() : { groupId: null, assignments: [] };

  const emitRuntimeSnapshot = () => {
    config.onResourceRuntimeUpdate?.({
      ...getSandboxSnapshot(),
      agents: [...subAgentSnapshots.values()],
      updatedAt: Date.now(),
    });
  };

  try {
    const result = await runTaskGraph({
      goal: config.goal,
      tasks: rawSubtasks,
      maxParallelSubAgents: config.maxParallelSubAgents,
      executionMode: config.executionMode,
      runIdPrefix: "scheduler",
      replanning: config.replanning ? {
        ...config.replanning,
        onDecision: (context, decision) => {
          // Mark blocked nodes as "replanning" so the cockpit UI can show it.
          if (decision.action === "replace_blocked") {
            for (const { id: blockedId } of context.blockedNodes ?? []) {
              const snap = subAgentSnapshots.get(blockedId);
              if (snap) {
                subAgentSnapshots.set(blockedId, { ...snap, status: "replanning", updatedAt: Date.now() });
              }
            }
            emitRuntimeSnapshot();
          }
          config.replanning?.onDecision?.(context, decision);
        },
      } : undefined,
      executeSubtask: async (node, dag) => {
        // Pre-populate a "waiting" snapshot so the cockpit shows all nodes immediately.
        if (!subAgentSnapshots.has(node.id)) {
          const waitingFor = node.dependsOn
            .map(depId => dag.nodes[depId]?.title ?? depId)
            .filter(Boolean);
          subAgentSnapshots.set(node.id, {
            nodeId: node.id,
            title: node.title,
            status: waitingFor.length > 0 ? "waiting" : "starting",
            waitingFor: waitingFor.length > 0 ? waitingFor : undefined,
            startedAt: Date.now(),
            updatedAt: Date.now(),
            lastProgressAt: Date.now(),
            replanCount: 0,
            retryCount: 0,
          });
          emitRuntimeSnapshot();
        }

        const isolatedAssignment =
          resolvedExecutionMode === "isolated_tabs"
            ? await ensureSandboxAllocation(config, node, sandboxAllocator, (a) => { sandboxAllocator = a; })
            : null;

        const subtaskResult = await runSubAgentTask(
          node,
          (_subtask: SubtaskNode) => ({
            ...config,
            tabId: isolatedAssignment?.tabId ?? config.tabId,
            subtasks: undefined,
            maxParallelSubAgents: undefined,
            executionMode: undefined,
            memory: undefined,
            goal: `${config.goal} :: ${node.title}`,
            onHumanRequest: (request) => {
              if (isolatedAssignment && sandboxAllocator) {
                sandboxAllocator.highlight(node.id).catch((error) => {
                  console.warn(`[Orchestrator] failed to highlight sandbox tab: ${String(error)}`);
                });
              }
              config.onHumanRequest?.(request);
            },
          }),
          dag,
          {
            forwardLifecycleCallbacks: false,
            onSnapshot: (snapshot) => {
              subAgentSnapshots.set(node.id, snapshot);
              emitRuntimeSnapshot();
            },
          },
        );

        const normalizedResult: TaskGraphSubtaskResult = {
          success: subtaskResult.success,
          finalState: subtaskResult.finalState,
          error: subtaskResult.error?.message,
          summary: extractTaskGraphSummary(subtaskResult.finalState),
        };

        try {
          const persistResult = await persistDagNodeExecution({
            dagRunId,
            node,
            executionMode: resolvedExecutionMode,
            finalState: subtaskResult.finalState,
            success: subtaskResult.success,
            summary: normalizedResult.summary,
            error: normalizedResult.error,
            sandboxGroupId: getSandboxSnapshot().groupId ?? undefined,
            sandboxTabId: isolatedAssignment?.tabId,
          });
          normalizedResult.taskRunId = persistResult.taskRunId;
          // Backfill taskRunId into the live snapshot so the cockpit can filter ThoughtChain.
          const existing = subAgentSnapshots.get(node.id);
          if (existing && persistResult.taskRunId) {
            subAgentSnapshots.set(node.id, { ...existing, taskRunId: persistResult.taskRunId });
            emitRuntimeSnapshot();
          }
        } catch (error) {
          console.warn(
            `[Orchestrator] failed to persist dag node execution for ${node.id}: ${String(error)}`,
          );
        }

        return normalizedResult;
      },
      onRoundStart: () => {},
      onPolicyResolved: (decision) => {
        resolvedExecutionMode = decision.executionMode;
        effectiveMaxParallelSubAgents = decision.effectiveMaxParallelSubAgents;
      },
    });

    let dagResolution: { status: "finish" | "fail"; reason: string; finalSummary?: string } | undefined;
    if (result.schedulerRuntime.failed.length > 0) {
      dagResolution = await resolveDagRunOutcome(
        config.goal,
        result.schedulerRuntime,
        result.subtaskDag,
        result.subtaskResults,
      );
      if (dagResolution.status !== "finish") {
        throw new Error(`Dependency scheduler failed subtasks: ${result.schedulerRuntime.failed.join(', ')}`);
      }
    }

    config.onFinish?.({
      status: "FINISHED",
      goal: config.goal,
      dag_run_id: dagRunId,
      dag_execution_mode: resolvedExecutionMode,
      dag_max_parallel_sub_agents: effectiveMaxParallelSubAgents,
      scheduler_runtime: result.schedulerRuntime,
      subtask_dag: result.subtaskDag,
      subtask_results: result.subtaskResults,
      dag_resolution: dagResolution,
      final_summary: dagResolution?.finalSummary,
      resource_runtime: {
        ...getSandboxSnapshot(),
        agents: [...subAgentSnapshots.values()],
        updatedAt: Date.now(),
      },
    });
  } finally {
    const allocator = sandboxAllocator as SandboxTabAllocator | null;
    if (allocator) {
      try {
        await allocator.destroy();
      } catch (error) {
        console.warn(`[Orchestrator] sandbox destroy warning: ${String(error)}`);
      }
    }
  }
}
