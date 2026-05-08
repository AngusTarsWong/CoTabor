export interface SandboxTabAssignment {
  nodeId: string;
  tabId: number;
  url: string;
}

export type ObservedSubAgentStatus =
  | "waiting"
  | "starting"
  | "running"
  | "replanning"
  | "stopping"
  | "success"
  | "failed"
  | "stopped";

export interface SubAgentHumanRequest {
  type: "confirmation" | "login" | "captcha" | "2fa" | "stuck";
  message: string;
  actionDescription?: string;
}

export interface SubAgentRuntimeSnapshot {
  nodeId: string;
  /** Human-readable task title from SubtaskNode.title. */
  title?: string;
  /** Browser tab ID this agent is operating on. */
  tabId?: number;
  /** Links to WorkflowNodeRecord.taskRunId for thought-chain filtering. */
  taskRunId?: string;
  /** The original temporary taskRunId generated during execution, before persistence. */
  originalTaskRunId?: string;
  /** Active human intervention request for this agent, if any. */
  humanRequest?: SubAgentHumanRequest | null;
  /** Titles of dependency nodes still blocking this agent (only set when status="waiting"). */
  waitingFor?: string[];
  status: ObservedSubAgentStatus;
  startedAt: number;
  updatedAt: number;
  lastProgressAt: number;
  currentStep?: string;
  currentUrl?: string;
  summarySoFar?: string;
  error?: string;
  replanCount: number;
  retryCount: number;
}

export interface SandboxRuntimeSnapshot {
  groupId: number | null;
  /** Tab ID of the swarm cockpit page, if one has been opened. */
  cockpitTabId?: number;
  assignments: SandboxTabAssignment[];
  agents?: SubAgentRuntimeSnapshot[];
  updatedAt?: number;
}
