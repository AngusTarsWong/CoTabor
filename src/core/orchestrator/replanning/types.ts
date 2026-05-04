import type { TaskGraphTaskInput } from "../types/TaskGraph";

export interface CompletedNodeSummary {
  id: string;
  title: string;
  summary?: string;
}

export interface BlockedNodeSummary {
  id: string;
  title: string;
  description?: string;
}

export interface FailedNodeInfo {
  id: string;
  title: string;
  error: string;
  attempt: number;
}

export interface ReplanContext {
  originalGoal: string;
  completedNodes: CompletedNodeSummary[];
  failedNode: FailedNodeInfo;
  blockedNodes: BlockedNodeSummary[];
}

export type ReplanDecision =
  | { action: "continue" }
  | { action: "replace_blocked"; newNodes: TaskGraphTaskInput[] }
  | { action: "abort"; reason: string };
