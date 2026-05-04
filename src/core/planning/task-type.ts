import type { PlannedAction } from "../types/history";

function normalizeText(value?: string | null): string {
  return (value || "").trim();
}

export function resolveTaskType(input: {
  currentTaskType?: string | null;
  action?: PlannedAction | null;
}): string {
  const currentTaskType = normalizeText(input.currentTaskType);
  const action = input.action;

  const explicitTaskType = normalizeText(action?.task_type);
  if (explicitTaskType) return explicitTaskType;

  const skillName = normalizeText(action?.skill_name);
  if (skillName) return skillName;

  const actionType = normalizeText(action?.type);
  if (!actionType || actionType === "finish") {
    return currentTaskType;
  }

  if (actionType === "memorize") {
    return currentTaskType || "memorize";
  }

  return actionType;
}
