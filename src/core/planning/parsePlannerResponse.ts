import type { PlannedAction, HistoryStep } from "../types/history";
import type { Skill } from "../../skills/types";
import type { AgentState, Task } from "../graph/state";
import { log } from "../../shared/utils/log";

function stripMarkdownFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```json")) s = s.replace(/^```json/, "").replace(/```$/, "").trim();
  else if (s.startsWith("```")) s = s.replace(/^```/, "").replace(/```$/, "").trim();
  return s;
}

function getDeclaredSkillParamKeys(skill?: Skill): string[] {
  if (!skill?.params || typeof skill.params !== "object") {
    return [];
  }

  const raw = skill.params as Record<string, unknown>;
  if (Array.isArray((raw as any).required)) {
    return ((raw as any).required as unknown[]).filter((key): key is string => typeof key === "string" && key.trim().length > 0);
  }
  if (raw.properties && typeof raw.properties === "object") {
    return Object.keys(raw.properties as Record<string, unknown>);
  }

  return Object.keys(raw).filter((key) => !key.startsWith("$"));
}

function normalizeSkillParams(actionData: PlannedAction, filteredSkills: Skill[]): PlannedAction {
  if (actionData.type !== "call_skill" || !actionData.skill_name) {
    return actionData;
  }

  const skill = filteredSkills.find((item) => item.name === actionData.skill_name);
  if (!skill) {
    return actionData;
  }

  const params = actionData.params && typeof actionData.params === "object" ? { ...actionData.params } : {};
  const declaredKeys = getDeclaredSkillParamKeys(skill);
  if (declaredKeys.length !== 1) {
    return { ...actionData, params };
  }

  const requiredKey = declaredKeys[0];
  if (requiredKey in params) {
    return { ...actionData, params };
  }

  const providedKeys = Object.keys(params);
  if (providedKeys.length !== 1) {
    return { ...actionData, params };
  }

  const providedKey = providedKeys[0];
  const providedValue = params[providedKey];
  if (providedKey === requiredKey || providedValue === undefined) {
    return { ...actionData, params };
  }

  log.info(`[Planner] Normalized params for skill '${actionData.skill_name}': '${providedKey}' -> '${requiredKey}'`);
  return {
    ...actionData,
    params: {
      [requiredKey]: providedValue,
    },
  };
}

export function normalizePlannedAction(actionData: PlannedAction, filteredSkills: Skill[]): PlannedAction {
  let normalized = actionData;

  // Normalise browser_* shorthand
  if (typeof normalized.type === "string" && normalized.type.startsWith("browser_")) {
    normalized = {
      ...normalized,
      type: "call_skill",
      skill_name: normalized.type,
      params: normalized.params || {},
      description: normalized.description || `Execute ${normalized.type}`,
    };
  } else if (normalized.type === "requires_human") {
    normalized = {
      ...normalized,
      type: "call_skill",
      skill_name: (normalized as any).skill_name || "browser_navigate",
      params: (normalized as any).params || {},
      requires_human: true,
    };
  } else if (
    typeof normalized.type === "string" &&
    normalized.type !== "call_skill" &&
    filteredSkills.some(s => s.name === normalized.type)
  ) {
    normalized = {
      ...normalized,
      type: "call_skill",
      skill_name: normalized.type,
      params: normalized.params || {},
      description: normalized.description || `Execute ${normalized.type}`,
    };
  }

  return normalizeSkillParams(normalized, filteredSkills);
}

/**
 * Parses the raw LLM output string into a PlannedAction.
 * - Strips markdown code fences
 * - Normalises `browser_*` shorthand to `call_skill`
 * - Normalises skill-name-as-type shorthand to `call_skill`
 * - Blocks duplicate successful skill calls (loop prevention)
 */
export function parsePlannerResponse(
  content: string,
  filteredSkills: Skill[],
  state: Pick<AgentState, "total_history" | "last_observation" | "task_list"> & {
    meta_data?: Record<string, any>;
  },
): { action: PlannedAction; updatedTaskList: Task[] } {
  let actionData: PlannedAction;

  try {
    actionData = JSON.parse(stripMarkdownFence(content || "{}"));
  } catch (e) {
    log.error("[Planner]", "Failed to parse JSON response:", e);
    actionData = { type: "error", description: "Failed to parse LLM response" };
  }
  if (typeof actionData.type !== "string" || !actionData.type.trim()) {
    actionData = { type: "error", description: "Planner response did not include a valid action type" };
  }
  actionData = normalizePlannedAction(actionData, filteredSkills);

  const allowSpawnSubagent = state.meta_data?.allowSpawnSubagent !== false && state.meta_data?.swarmMode !== true;
  if (!allowSpawnSubagent && (actionData.type === "spawn_subagent" || actionData.type === "spawn_dag")) {
    actionData = {
      type: "replan",
      description:
        "Blocked spawn_subagent inside a sub-agent. Complete the assigned leaf task directly.",
      reason: "spawn_subagent_disabled",
    };
  }

  // Loop prevention: block identical repeated successful skill calls
  const { total_history, last_observation } = state;
  const lastStep: HistoryStep | undefined = total_history[total_history.length - 1];
  const isRepeated =
    actionData.type === "call_skill" &&
    lastStep?.action?.type === "call_skill" &&
    actionData.skill_name === lastStep.action.skill_name &&
    JSON.stringify(actionData.params || {}) === JSON.stringify(lastStep.action.params || {}) &&
    lastStep?.result?.success === true &&
    last_observation?.kind === "skill_result";

  if (isRepeated) {
    actionData = {
      type: "finish",
      result: `Planner detected a repeated successful skill call for ${actionData.skill_name} with identical params. The latest tool result has already been returned.`,
      description: `Blocked duplicate call to ${actionData.skill_name}; terminating to avoid an infinite loop.`,
    };
  }

  const rawTaskList = actionData.task_list || state.task_list || [];
  const updatedTaskList: Task[] = rawTaskList.map((task, index) => ({
    id: typeof task.id === "string" && task.id.trim() ? task.id : String(index + 1),
    goal: task.goal,
    status: task.status as Task["status"],
  }));

  // Append plan summary on finish
  if (actionData.type === "finish" && updatedTaskList.length > 0) {
    const planSummary = updatedTaskList.map(t => `- [${t.status}] ${t.goal}`).join("\n");
    actionData = { ...actionData, summary: `${actionData.summary || ""}\n\n执行过程回顾:\n${planSummary}` };
  }

  return { action: actionData, updatedTaskList };
}
