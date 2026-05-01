import { AgentConfig, ClawAgent } from "../../../lib/claw/agent";
import { SubtaskNode, SubtaskDag } from "../types/SubtaskDag";
import type { SubAgentRuntimeSnapshot } from "../types/ResourceRuntime";

export interface SubAgentRunResult {
  success: boolean;
  finalState?: any;
  error?: Error;
}

export interface RunSubAgentTaskOptions {
  forwardLifecycleCallbacks?: boolean;
  onSnapshot?: (snapshot: SubAgentRuntimeSnapshot) => void;
  inactivityTimeoutMs?: number;
  maxRuntimeMs?: number;
}

const DEFAULT_OBSERVER_POLL_MS = 5000;
const DEFAULT_INACTIVITY_TIMEOUT_MS = 45000;
const DEFAULT_MAX_RUNTIME_MS = 180000;

interface SubAgentObserverThresholds {
  inactivityTimeoutMs: number;
  maxRuntimeMs: number;
}

export function shouldStopObservedSubAgent(
  snapshot: SubAgentRuntimeSnapshot,
  now: number,
  thresholds: SubAgentObserverThresholds,
): { shouldStop: boolean; reason?: string } {
  if (snapshot.status === "success" || snapshot.status === "failed" || snapshot.status === "stopped") {
    return { shouldStop: false };
  }

  if (now - snapshot.startedAt > thresholds.maxRuntimeMs) {
    return {
      shouldStop: true,
      reason: `子任务总运行时长超过 ${Math.round(thresholds.maxRuntimeMs / 1000)} 秒`,
    };
  }

  if (now - snapshot.lastProgressAt > thresholds.inactivityTimeoutMs) {
    return {
      shouldStop: true,
      reason: `子任务超过 ${Math.round(thresholds.inactivityTimeoutMs / 1000)} 秒无进展`,
    };
  }

  return { shouldStop: false };
}

function extractStepSummary(step: any): string | undefined {
  const candidates = [
    step?.update?.planner_output?.action?.description,
    step?.update?.planner_output?.action?.result,
    step?.update?.step_summary,
    step?.update?.watchdog_output?.reason,
    step?.update?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function describeCurrentStep(step: any): string {
  const node = typeof step?.node === "string" ? step.node : "unknown";
  const action = step?.update?.planner_output?.action;
  if (action?.type && typeof action.type === "string") {
    if (typeof action.description === "string" && action.description.trim()) {
      return `${node}:${action.type}:${action.description.trim()}`;
    }
    return `${node}:${action.type}`;
  }
  return node;
}

function extractCurrentUrl(step: any): string | undefined {
  const url = step?.update?.meta_data?.url;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

function extractReplanCount(step: any, previous: number): number {
  const count = step?.update?.replan_count;
  return typeof count === "number" && Number.isFinite(count) ? count : previous;
}

function extractRetryCount(step: any, previous: number): number {
  const count = step?.update?.cortex_retry_count;
  return typeof count === "number" && Number.isFinite(count) ? count : previous;
}

/** Build the goal string for a subtask, injecting predecessor output summaries for dependent tasks. */
function buildSubtaskGoal(subtask: SubtaskNode, dag?: SubtaskDag): string {
  const originalTaskInput = subtask.metadata?.originalTaskInput as
    | { goal?: string; description?: string }
    | undefined;
  const base =
    subtask.description ??
    originalTaskInput?.goal ??
    originalTaskInput?.description ??
    subtask.title;
  const replayDependencyContext = Array.isArray(subtask.metadata?.replayDependencyContext)
    ? subtask.metadata.replayDependencyContext
    : [];
  const targetUrl =
    typeof subtask.metadata?.targetUrl === "string" && subtask.metadata.targetUrl.trim()
      ? subtask.metadata.targetUrl.trim()
      : undefined;
  const sourceSite =
    typeof subtask.metadata?.sourceSite === "string" && subtask.metadata.sourceSite.trim()
      ? subtask.metadata.sourceSite.trim()
      : undefined;
  const resourceProfile =
    typeof subtask.metadata?.resourceProfile === "string" ? subtask.metadata.resourceProfile : undefined;

  const executionHints: string[] = [];
  if (sourceSite) {
    executionHints.push(`来源站点：${sourceSite}`);
  }
  if (targetUrl) {
    executionHints.push(`目标页面：${targetUrl}`);
  }
  if (resourceProfile === "page_read" || resourceProfile === "page_write") {
    executionHints.push("优先基于当前已打开页面完成任务；仅当当前页面明显不是目标站点时再重新导航。");
  }

  if ((!dag || subtask.dependsOn.length === 0) && replayDependencyContext.length === 0 && executionHints.length === 0) {
    return base;
  }

  const dagDependencyLines = dag
    ? subtask.dependsOn.map((depId) => {
        const dep = dag.nodes[depId];
        if (!dep?.outputRef?.summary) return null;
        return `[${dep.title}]: ${dep.outputRef.summary}`;
      })
    : [];

  const predecessorLines = [
    ...dagDependencyLines,
    ...replayDependencyContext.map((item: any) => {
      if (!item || typeof item.summary !== "string" || !item.summary.trim()) return null;
      const title = typeof item.title === "string" && item.title.trim() ? item.title : item.id || "依赖节点";
      return `[${title}]: ${item.summary.trim()}`;
    }),
  ].filter(Boolean);

  const sections = [base];
  if (executionHints.length > 0) {
    sections.push(`执行上下文：\n${executionHints.join("\n")}`);
  }
  if (predecessorLines.length > 0) {
    sections.push(`前置任务输出摘要（供参考）：\n${predecessorLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export async function runSubAgentTask(
  subtask: SubtaskNode,
  configFactory: (subtask: SubtaskNode) => AgentConfig,
  dag?: SubtaskDag,
  options: RunSubAgentTaskOptions = {},
): Promise<SubAgentRunResult> {
  const baseConfig = configFactory(subtask);
  const forwardLifecycleCallbacks = options.forwardLifecycleCallbacks ?? true;
  const startedAt = Date.now();
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
  const maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;

  return await new Promise<SubAgentRunResult>((resolve) => {
    let settled = false;
    let stopRequestedByObserver = false;
    let snapshot: SubAgentRuntimeSnapshot = {
      nodeId: subtask.id,
      status: "starting",
      startedAt,
      updatedAt: startedAt,
      lastProgressAt: startedAt,
      currentStep: "start",
      currentUrl:
        typeof subtask.metadata?.targetUrl === "string" ? subtask.metadata.targetUrl : undefined,
      replanCount: 0,
      retryCount: 0,
    };

    const publishSnapshot = (patch: Partial<SubAgentRuntimeSnapshot>) => {
      snapshot = {
        ...snapshot,
        ...patch,
        updatedAt: Date.now(),
      };
      options.onSnapshot?.(snapshot);
    };

    const settle = (result: SubAgentRunResult) => {
      if (settled) return;
      settled = true;
      clearInterval(observerTimer);
      resolve(result);
    };

    const agent = new ClawAgent({
      ...baseConfig,
      goal: buildSubtaskGoal(subtask, dag),
      onStep: async (step) => {
        const nextSummary = extractStepSummary(step);
        publishSnapshot({
          status: "running",
          currentStep: describeCurrentStep(step),
          currentUrl: extractCurrentUrl(step) ?? snapshot.currentUrl,
          lastProgressAt: Date.now(),
          replanCount: extractReplanCount(step, snapshot.replanCount),
          retryCount: extractRetryCount(step, snapshot.retryCount),
          summarySoFar: nextSummary ?? snapshot.summarySoFar,
        });
        await baseConfig.onStep?.(step);
      },
      onFinish: (result) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onFinish?.(result);
        }
        publishSnapshot({
          status: "success",
          currentStep: "finish",
          lastProgressAt: Date.now(),
          currentUrl:
            typeof result?.meta_data?.url === "string" ? result.meta_data.url : snapshot.currentUrl,
          summarySoFar: extractStepSummary({ update: result }) ?? snapshot.summarySoFar,
          error: undefined,
        });
        settle({ success: true, finalState: result });
      },
      onError: (error) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onError?.(error);
        }
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        publishSnapshot({
          status: "failed",
          currentStep: stopRequestedByObserver ? "observer_stop" : "error",
          error: normalizedError.message,
        });
        settle({ success: false, error: normalizedError });
      },
      onStopped: (result) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onStopped?.(result);
        }
        publishSnapshot({
          status: "stopped",
          currentStep: stopRequestedByObserver ? "observer_stop" : "stopped",
          currentUrl:
            typeof result?.meta_data?.url === "string" ? result.meta_data.url : snapshot.currentUrl,
          summarySoFar: extractStepSummary({ update: result }) ?? snapshot.summarySoFar,
          error: stopRequestedByObserver ? snapshot.error : "Sub-agent stopped",
        });
        settle({ success: false, finalState: result, error: new Error(snapshot.error || "Sub-agent stopped") });
      },
    });

    publishSnapshot(snapshot);

    const observerTimer = setInterval(() => {
      if (settled || stopRequestedByObserver) return;

      const decision = shouldStopObservedSubAgent(snapshot, Date.now(), {
        inactivityTimeoutMs,
        maxRuntimeMs,
      });
      if (!decision.shouldStop || !decision.reason) {
        return;
      }

      stopRequestedByObserver = true;
      publishSnapshot({
        status: "stopping",
        currentStep: "observer_stop",
        error: decision.reason,
      });
      baseConfig.onLog?.(`[SubAgentObserver] node=${subtask.id} ${decision.reason}，准备停止该子任务。`);
      agent.stop().catch((error) => {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        publishSnapshot({
          status: "failed",
          currentStep: "observer_stop_failed",
          error: normalizedError.message,
        });
        settle({ success: false, error: normalizedError });
      });
    }, DEFAULT_OBSERVER_POLL_MS);

    agent.start().catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      publishSnapshot({
        status: "failed",
        currentStep: "start_failed",
        error: normalizedError.message,
      });
      settle({ success: false, error: normalizedError });
    });
  });
}
