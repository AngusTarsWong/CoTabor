import type { SubtaskOutputRef } from "../types/SubtaskDag";

type PayloadType = SubtaskOutputRef["payloadType"];

export interface ExtractedOutput {
  summary: string | undefined;
  payload: unknown;
  payloadType: PayloadType;
}

// Candidate paths in finalState where structured output may live, in priority order.
const STRUCTURED_CANDIDATE_PATHS = [
  "executor_output.result",
  "planner_output.action.result_data",
  "output",
  "data",
];

// Candidate paths for the text summary, in priority order.
const SUMMARY_CANDIDATE_PATHS = [
  "planner_output.action.description",
  "planner_output.action.result",
  "output",
  "summary",
  "data",
];

function getNestedPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function tryParseJson(value: string): unknown {
  try {
    const parsed = JSON.parse(value);
    // Only treat as structured if it's an object or array, not a plain scalar.
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}

function inferPayloadType(value: unknown): PayloadType {
  if (Array.isArray(value)) {
    const looksLikeUrlList =
      value.length > 0 &&
      value.every((item) => typeof item === "string" && /^https?:\/\//.test(item));
    return looksLikeUrlList ? "url_list" : "list";
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value as object);
    // Heuristic: if it looks like a row/cell structure assume table.
    if (keys.some((k) => /^(rows?|columns?|headers?|cells?)$/i.test(k))) return "table";
    return "object";
  }
  return "text";
}

function extractSummary(finalState: unknown): string | undefined {
  for (const path of SUMMARY_CANDIDATE_PATHS) {
    const value = getNestedPath(finalState, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function extractStructuredPayload(
  finalState: unknown,
): { payload: unknown; payloadType: PayloadType } {
  for (const path of STRUCTURED_CANDIDATE_PATHS) {
    const value = getNestedPath(finalState, path);
    if (value === undefined || value === null) continue;

    // Non-string structured value — use directly.
    if (typeof value !== "string") {
      return { payload: value, payloadType: inferPayloadType(value) };
    }

    // JSON-encoded string — try to parse.
    const parsed = tryParseJson(value);
    if (parsed !== null) {
      return { payload: parsed, payloadType: inferPayloadType(parsed) };
    }
  }
  return { payload: undefined, payloadType: "text" };
}

/**
 * Extracts both a human-readable summary and a structured payload from the
 * agent's finalState. The payload preserves full fidelity so downstream agents
 * can consume structured data instead of lossy text summaries.
 */
export function extractSubtaskOutput(finalState: unknown): ExtractedOutput {
  const summary = extractSummary(finalState);
  const { payload, payloadType } = extractStructuredPayload(finalState);

  return {
    summary,
    payload: payload ?? summary,
    payloadType: payload !== undefined ? payloadType : "text",
  };
}

/**
 * Formats a structured payload for injection into a downstream agent's goal.
 * Returns null if there is no useful structured data (text-only).
 */
export function formatPayloadForContext(
  title: string,
  outputRef: SubtaskOutputRef,
): string {
  const { summary, payload, payloadType } = outputRef;

  if (!payload && !summary) return "";

  if (!payload || payloadType === "text") {
    return `[${title}]: ${summary ?? ""}`;
  }

  const jsonStr = JSON.stringify(payload, null, 2);
  const truncated =
    jsonStr.length > 3000 ? jsonStr.slice(0, 3000) + "\n  ... (truncated)" : jsonStr;

  return [
    `[${title}]:`,
    `摘要：${summary ?? "(无)"}`,
    `结构化数据 (${payloadType})：`,
    "```json",
    truncated,
    "```",
  ].join("\n");
}
