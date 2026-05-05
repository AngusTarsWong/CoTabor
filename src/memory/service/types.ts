import type { Skill } from "../../skills/types.ts";
import type { NodeMemoryUsage } from "../retrieval/memory-usage-builder.ts";
import type { RetrievedMemoriesPayload } from "../retrieval/retrieve-and-assemble-memories.ts";
export type MemoryConsumer = "planner" | "replanner" | "executor";
export type MemoryRefreshReason =
  | "entry"
  | "retry"
  | "post_cortex"
  | "post_human"
  | "execution"
  | "manual";
export type MemoryRefreshMode = "reuse" | "partial" | "full";

export interface MemoryRefreshTelemetry {
  refreshed: boolean;
  refreshMode: MemoryRefreshMode;
  consumer: MemoryConsumer;
  reason: MemoryRefreshReason;
  refreshKey: string;
  matchedCounts: {
    l1: number;
    l2: number;
    l3: number;
  };
  staleReasons: string[];
}

export interface MemoryRefreshState {
  lastRefreshAt?: number;
  lastRefreshKey?: string;
  plannerKey?: string;
  replannerKey?: string;
  executorKey?: string;
  lastUrl?: string;
  lastBoundTabId?: number;
  lastTaskType?: string;
  lastSkillSetFingerprint?: string;
  lastIntentFingerprint?: string;
  lastRequestFingerprint?: string;
  lastMode?: MemoryRefreshMode;
}

export interface MemoryRefreshContext {
  consumer: MemoryConsumer;
  reason: MemoryRefreshReason;
  request: string;
  taskRunId?: string;
  taskType?: string;
  currentUrl?: string;
  currentDomain?: string;
  currentPath?: string;
  boundTabId?: number;
  activeTabId?: number | null;
  openedTabs?: Array<{ tabId: number; title: string; url: string }>;
  availableSkillsInput?: Skill[];
  skillSetFingerprint?: string;
  plannedAction?: {
    type?: string;
    skillName?: string;
    intent?: string;
    description?: string;
    params?: Record<string, unknown>;
  };
  lastObservation?: {
    kind?: string;
    skillName?: string;
    text?: string;
    params?: Record<string, unknown>;
  } | null;
  lastErrorContext?: string | null;
  replanContext?: string | null;
  consecutiveFailures?: number;
  recentHistoryDigest: Array<{
    step: number;
    actionType?: string;
    skillName?: string;
    intent?: string;
    stepSummary?: string;
    url?: string;
  }>;
  existingMemorySnapshot: {
    retrievedMemories?: Partial<RetrievedMemoriesPayload>;
    availableSkills?: Skill[];
    memoryRefreshState?: MemoryRefreshState | null;
  };
}

export interface MemoryRefreshResult {
  statePatch: {
    retrieved_memories: RetrievedMemoriesPayload;
    available_skills: Skill[];
    node_memory_usage: NodeMemoryUsage;
    memory_refresh_state: MemoryRefreshState;
  };
  telemetry: MemoryRefreshTelemetry;
  snapshot: {
    retrievedMemories: RetrievedMemoriesPayload;
    availableSkills: Skill[];
    nodeMemoryUsage: NodeMemoryUsage;
    memoryRefreshState: MemoryRefreshState;
  };
}
