import { AgentConfig, ClawAgent } from "../../../lib/claw/agent";
import { SubtaskNode, SubtaskDag } from "../types/SubtaskDag";
import type { SubAgentRuntimeSnapshot } from "../types/ResourceRuntime";
import { formatPayloadForContext } from "./OutputExtractor";
import { SwarmState } from "../types/SwarmState";

export interface SubAgentRunResult {
  success: boolean;
  finalState?: any;
  error?: Error;
  /** Extracted structured patch for the global swarm blackboard */
  swarmStatePatch?: any;
}

export interface RunSubAgentTaskOptions {
  forwardLifecycleCallbacks?: boolean;
  onSnapshot?: (snapshot: SubAgentRuntimeSnapshot) => void;
  inactivityTimeoutMs?: number;
  maxRuntimeMs?: number;
  swarmState?: SwarmState;
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
 * Build the goal string for a subtask, injecting predecessor output summaries 
 * and structured blackboard facts for collective intelligence. 
 */
function buildSubtaskGoal(subtask: SubtaskNode, swarmState?: SwarmState, dag?: SubtaskDag): string {
  const originalTaskInput = subtask.metadata?.originalTaskInput as
    | { goal?: string; description?: string }
    | undefined;
  const base =
    subtask.description ??
    originalTaskInput?.goal ??
    originalTaskInput?.description ??
    subtask.title;
    
  const executionHints: string[] = [];
  const targetUrl = subtask.metadata?.targetUrl || subtask.metadata?.url;
  if (targetUrl) {
    executionHints.push(`目标页面：${targetUrl}`);
  }

  const sections = [base];
  if (executionHints.length > 0) {
    sections.push(`执行提示：\n${executionHints.join("\n")}`);
  }

  // 1. Inject Collective Intelligence from Swarm Blackboard (L0)
  if (swarmState && Object.keys(swarmState.blackboard).length > 0) {
    const facts = Object.entries(swarmState.blackboard)
      .map(([key, fact]) => `- [${key}]: ${typeof fact.value === 'object' ? JSON.stringify(fact.value) : fact.value}`)
      .join("\n");
    sections.push(`蜂群实时共享事实 (供参考)：\n${facts}`);
  }

  // 2. Inject Legacy Shared Context / Summaries
  if (swarmState && swarmState.sharedContext.length > 0) {
    sections.push(`相关前置线索：\n${swarmState.sharedContext.join("\n")}`);
  }

  // 3. Fallback to direct DAG dependency context if swarmState is missing
  if (!swarmState && dag && subtask.dependsOn.length > 0) {
    const dagDependencyLines = subtask.dependsOn.map((depId) => {
        const dep = dag.nodes[depId];
        if (!dep?.outputRef) return null;
        return formatPayloadForContext(dep.title, dep.outputRef);
      }).filter(Boolean);
    if (dagDependencyLines.length > 0) {
      sections.push(`前置任务输出：\n${dagDependencyLines.join("\n\n")}`);
    }
  }

  return sections.join("\n\n");
}

/** 
 * Heuristically extracts a structured patch from the agent's final state 
 * for the swarm blackboard. 
 */
function extractSwarmStatePatch(finalState: any, nodeId: string): any | undefined {
  // Navigation: The planner usually puts results in planner_output.action
  const action = finalState?.planner_output?.action;
  const extracted = action?.extracted_data || finalState?.planner_output?.extracted_data || finalState?.meta_data?.extracted_data;
  
  if (!extracted || typeof extracted !== "object") return undefined;

  const now = Date.now();
  const blackboard: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(extracted)) {
    blackboard[key] = {
      value,
      confidence: 0.9, // Default confidence for explicit extraction
      sourceNodeId: nodeId,
      updatedAt: now,
    };
  }

  return { blackboard };
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

    const settle = (result: SubAgentRunResult) => {
      if (settled) return;
      settled = true;
      clearInterval(observerTimer);
      resolve(result);
    };

    const agent = new ClawAgent({
      ...baseConfig,
      goal: buildSubtaskGoal(subtask, options.swarmState, dag),
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
        settle({ 
          success: true, 
          finalState: result,
          swarmStatePatch: extractSwarmStatePatch(result, subtask.id)
        });
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
