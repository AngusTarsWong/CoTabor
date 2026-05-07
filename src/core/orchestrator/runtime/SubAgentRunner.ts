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
  onAgentCreated?: (agent: ClawAgent) => void;
  onAgentSettled?: (agent: ClawAgent) => void;
  inactivityTimeoutMs?: number;
  maxRuntimeMs?: number;
  /** Notebook data accumulated by predecessor nodes, injected as the agent's initial notebook. */
  initialNotebook?: Record<string, any>;
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
      reason: `Subtask runtime exceeded ${Math.round(thresholds.maxRuntimeMs / 1000)} seconds`,
    };
  }

  if (now - snapshot.lastProgressAt > thresholds.inactivityTimeoutMs) {
    return {
      shouldStop: true,
      reason: `Subtask made no progress for ${Math.round(thresholds.inactivityTimeoutMs / 1000)} seconds`,
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

/**
 * Resolves the goal text for a subtask. Predecessor data is passed via the
 * agent's initial notebook state (Notebook Handoff Protocol), not via text injection.
 */
function buildSubtaskGoal(subtask: SubtaskNode): string {
  const meta = subtask.metadata?.originalTaskInput as
    | { goal?: string; description?: string }
    | undefined;
  const base = subtask.description ?? meta?.goal ?? meta?.description ?? subtask.title;

  const targetUrl = subtask.metadata?.targetUrl || subtask.metadata?.url;
  if (!targetUrl) return base;
  return `${base}\n\n执行提示：\n目标页面：${targetUrl}`;
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
      title: subtask.title,
      tabId: typeof baseConfig.tabId === "number" ? baseConfig.tabId : undefined,
      taskRunId: undefined,
      humanRequest: null,
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

    let agent: ClawAgent;

    const settle = (result: SubAgentRunResult) => {
      if (settled) return;
      settled = true;
      clearInterval(observerTimer);
      options.onAgentSettled?.(agent);
      resolve(result);
    };

    agent = new ClawAgent({
      ...baseConfig,
      goal: buildSubtaskGoal(subtask),
      initialNotebook: options.initialNotebook,
      onHumanRequest: (req) => {
        publishSnapshot({
          humanRequest: {
            type: (req as any).type ?? "stuck",
            message: req.message,
            actionDescription: req.action_description,
          },
        });
        baseConfig.onHumanRequest?.(req);
      },
      onStep: async (step) => {
        if (!snapshot.taskRunId && (step as any).taskRunId) {
          publishSnapshot({ taskRunId: (step as any).taskRunId });
        }
        const nextSummary = extractStepSummary(step);
        publishSnapshot({
          status: "running",
          humanRequest: null,
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
          humanRequest: null,
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

    options.onAgentCreated?.(agent);
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
