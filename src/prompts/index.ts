/**
 * CoTabor Prompt Library
 *
 * All LLM prompts are centralised here so contributors can understand and
 * modify AI behaviour without digging into business logic files.
 *
 * Directory layout:
 *   agent/          — Core agent node prompts (planner, executor, watchdog, …)
 *   orchestrator/   — Multi-agent DAG prompts (planning, result resolution)
 *   skills/         — Operator sub-agent prompts (Feishu, Notion)
 *   memory/         — Memory system prompts (distiller, experience summarizer)
 */

// ── Agent nodes ──────────────────────────────────────────────────────────────
export { plannerPrompt } from "./agent/planner";
export type { PlannerPromptVars } from "./agent/planner";

export { executorGroundingPrompt } from "./agent/executor-grounding";
export type { ExecutorGroundingVars } from "./agent/executor-grounding";

export { watchdogPrompt } from "./agent/watchdog";
export type { WatchdogPromptVars } from "./agent/watchdog";

export { replannerPrompt } from "./agent/replanner";
export type { ReplannerPromptVars } from "./agent/replanner";

export { memoryCompressPrompt } from "./agent/memory-compress";
export type { MemoryCompressPromptVars } from "./agent/memory-compress";

// ── Orchestrator ──────────────────────────────────────────────────────────────
export { dagPlannerPrompt, dagPlannerRepairPrompt } from "./orchestrator/dag-planner";
export type { DagPlannerPromptVars, DagPlannerRepairPromptVars } from "./orchestrator/dag-planner";

export { dagResultResolverPrompt } from "./orchestrator/dag-result-resolver";
export type { DagResultResolverPromptVars } from "./orchestrator/dag-result-resolver";

export { dagReplannerPrompt } from "./orchestrator/dag-replanner";
export type { DagReplannerPromptVars } from "./orchestrator/dag-replanner";

// ── Skills ────────────────────────────────────────────────────────────────────
export { feishuOperatorPrompt } from "./skills/feishu-operator";
export { notionOperatorPrompt } from "./skills/notion-operator";

// ── Memory ────────────────────────────────────────────────────────────────────
export { distillerMergePrompt } from "./memory/distiller-merge";
export type { DistillerMergePromptVars } from "./memory/distiller-merge";

export { distillerL3TrackPrompt } from "./memory/distiller-l3-track";
export type { DistillerL3TrackPromptVars } from "./memory/distiller-l3-track";

export { experienceSummarizerPrompt } from "./memory/experience-summarizer";
export type { ExperienceSummarizerPromptVars } from "./memory/experience-summarizer";

// ── Shared types ──────────────────────────────────────────────────────────────
export type { PromptTemplate, SystemOnlyPrompt, DynamicPrompt } from "./types";
export { resolveSystem } from "./types";
