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
  state: Pick<AgentState, "total_history" | "last_observation" | "task_list">,
): { action: PlannedAction; updatedTaskList: Task[] } {
  let actionData: PlannedAction;

  try {
    actionData = JSON.parse(stripMarkdownFence(content || "{}"));
  } catch (e) {
    log.error("[Planner]", "Failed to parse JSON response:", e);
    actionData = { type: "error", description: "Failed to parse LLM response" };
  }

  // Normalise browser_* shorthand
  if (typeof actionData.type === "string" && actionData.type.startsWith("browser_")) {
    actionData = {
      ...actionData,
      type: "call_skill",
      skill_name: actionData.type,
      params: actionData.params || {},
      description: actionData.description || `Execute ${actionData.type}`,
    };
  } else if (
    typeof actionData.type === "string" &&
    actionData.type !== "call_skill" &&
    filteredSkills.some(s => s.name === actionData.type)
  ) {
    actionData = {
      ...actionData,
      type: "call_skill",
      skill_name: actionData.type,
      params: actionData.params || {},
      description: actionData.description || `Execute ${actionData.type}`,
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
