import type { AgentState } from "../../core/graph/state.ts";
import type { HistoryStep, PlannedAction } from "../../core/types/history.ts";
import type { MemoryConsumer, MemoryRefreshContext, MemoryRefreshReason } from "./types.ts";

function toPlannedActionShape(action?: PlannedAction | null) {
  if (!action) return undefined;
  return {
    type: action.type,
    skillName: action.skill_name,
    intent: action.intent,
    description: action.description,
    params: action.params,
  };
}

function buildRecentHistoryDigest(totalHistory: HistoryStep[] = []) {
  return totalHistory.slice(-5).map((step) => ({
    step: step.step,
    actionType: step.action?.type,
    skillName: step.action?.skill_name,
    intent: step.action?.intent || step.action?.description,
    stepSummary: step.step_summary,
    url: typeof step.meta?.url === "string" ? step.meta.url : undefined,
  }));
}

function parseUrlMeta(currentUrl?: string): {
  currentDomain?: string;
  currentPath?: string;
} {
  if (!currentUrl) return {};
  try {
    const parsed = new URL(currentUrl);
    return {
      currentDomain: parsed.hostname,
      currentPath: parsed.pathname,
    };
  } catch {
    return {};
  }
}

export function buildMemoryRefreshContext(
  state: AgentState,
  options: {
    consumer: MemoryConsumer;
    reason: MemoryRefreshReason;
  }
): MemoryRefreshContext {
  const currentUrl =
    typeof state.meta_data?.url === "string" ? state.meta_data.url : undefined;
  const { currentDomain, currentPath } = parseUrlMeta(currentUrl);
  const currentAction = state.planner_output?.action || state.total_history[state.total_history.length - 1]?.action || null;
  const isPostHumanResume =
    options.consumer === "executor" &&
    (
      state.meta_data?.memory_refresh_reason === "post_human" ||
      (state.planner_output?.action?.requires_human === true && state.meta_data?.human_cancelled === false)
    );
  const requestedReason =
    isPostHumanResume
      ? "post_human"
      : options.reason;

  return {
    consumer: options.consumer,
    reason: requestedReason,
    request: state.request,
    taskRunId: state.task_run_id || undefined,
    taskType: state.task_type || undefined,
    currentUrl,
    currentDomain,
    currentPath,
    boundTabId: state.meta_data?.boundTabId ?? state.meta_data?.tabId,
    activeTabId: state.active_tab_id,
    openedTabs: state.opened_tabs,
    availableSkillsInput: Array.isArray(state.available_skills) ? state.available_skills : undefined,
    swarmState: state.swarm_state,
    plannedAction: toPlannedActionShape(currentAction),
    lastObservation: state.last_observation
      ? {
          kind: typeof state.last_observation.kind === "string" ? state.last_observation.kind : undefined,
          skillName:
            typeof state.last_observation.skill_name === "string"
              ? state.last_observation.skill_name
              : undefined,
          text: typeof state.last_observation.text === "string" ? state.last_observation.text : undefined,
          params:
            state.last_observation.params && typeof state.last_observation.params === "object"
              ? state.last_observation.params
              : undefined,
        }
      : null,
    lastErrorContext: state.last_error_context,
    replanContext: state.replan_context,
    consecutiveFailures: state.consecutive_failures,
    recentHistoryDigest: buildRecentHistoryDigest(state.total_history),
    existingMemorySnapshot: {
      retrievedMemories: state.retrieved_memories,
      availableSkills: state.available_skills,
      memoryRefreshState: state.memory_refresh_state,
    },
  };
}
