import { ENV } from "../constants/env";

export type TraceNode = "planner" | "executor" | "watchdog" | "cortex" | "replanner";
export type TracePhase = "enter" | "exit";

export interface TraceEvent {
  step_id?: number;
  session_id?: string;
  graph_run_id?: string;
  node: TraceNode;
  phase: TracePhase;
  ts: number;
  duration_ms?: number;
  action?: {
    type?: string;
    tool_name?: string;
    skill_name?: string;
    params_digest?: Record<string, unknown>;
  };
  result?: {
    status?: "success" | "fail";
    error_type?: string;
  };
  llm?: {
    model_name?: string;
    prompt_digest?: string;
    output_summary?: Record<string, unknown> | string;
    token_usage?: { prompt?: number; completion?: number; total?: number };
    latency_ms?: number;
  };
  state?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    diff?: Record<string, unknown>;
    recentHistory?: Array<Record<string, unknown>>;
  };
  route?: {
    watchdog_verdict?: "pass" | "fail";
    route_reason?: string;
    retry_count?: number;
    backoff_ms?: number;
    escalate_to?: "cortex" | "replanner";
  };
  media?: {
    dom_text_digest?: string;
    screenshot_ref?: string;
  };
}

function safeSendToExtension(message: any) {
  try {
    const hasChrome =
      typeof chrome !== "undefined" &&
      chrome &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function";
    if (hasChrome) {
      chrome.runtime.sendMessage(message);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function fallbackBufferPush(message: any) {
  const g: any = globalThis as any;
  if (!g.__cotabor_trace__) g.__cotabor_trace__ = [];
  g.__cotabor_trace__.push(message);
}

export function emitTrace(event: TraceEvent) {
  if (!ENV.DEBUG_MODE) return;
  const payload = { type: "TRACE_EVENT", data: event };
  const ok = safeSendToExtension(payload);
  if (!ok) {
    fallbackBufferPush(payload);
    console.log("[Trace]", payload);
  }
}
