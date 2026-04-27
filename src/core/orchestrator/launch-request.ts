import type { NormalizedLaunchRequest, TaskGraphLaunchPayload, TaskGraphTaskInput } from "./types/TaskGraph";

function stripJsonFence(input: string): string {
  const trimmed = input.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function normalizeSubtasks(payload: TaskGraphLaunchPayload): TaskGraphTaskInput[] {
  return payload.subtasks ?? payload.tasks ?? [];
}

function isNonEmptyObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAgentLaunchInput(input: string): NormalizedLaunchRequest {
  const raw = stripJsonFence(input);
  if (!raw.startsWith("{")) {
    return {
      mode: "single",
      source: "plain_text",
      goal: input.trim(),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isNonEmptyObject(parsed)) {
      return {
        mode: "single",
        source: "plain_text",
        goal: input.trim(),
      };
    }

    const payload = parsed as TaskGraphLaunchPayload;
    const subtasks = normalizeSubtasks(payload);
    if (subtasks.length > 0) {
      return {
        mode: "dag",
        source: "json",
        goal: String(payload.goal || "DAG 任务"),
        subtasks,
        maxParallelSubAgents:
          typeof payload.maxParallelSubAgents === "number" ? payload.maxParallelSubAgents : undefined,
        executionMode:
          payload.executionMode === "shared_tab" ||
          payload.executionMode === "single_page_serial" ||
          payload.executionMode === "isolated_tabs"
            ? payload.executionMode
            : undefined,
      };
    }

    if (typeof payload.goal === "string" && payload.goal.trim()) {
      return {
        mode: "single",
        source: "json",
        goal: payload.goal.trim(),
      };
    }
  } catch {
    // Fall back to plain-text mode so normal prompts that happen to start with "{" still work.
  }

  return {
    mode: "single",
    source: "plain_text",
    goal: input.trim(),
  };
}
