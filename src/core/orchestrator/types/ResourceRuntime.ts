export interface SandboxTabAssignment {
  nodeId: string;
  tabId: number;
  url: string;
}

export type ObservedSubAgentStatus =
  | "starting"
  | "running"
  | "stopping"
  | "success"
  | "failed"
  | "stopped";

export interface SubAgentRuntimeSnapshot {
  nodeId: string;
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
  assignments: SandboxTabAssignment[];
  agents?: SubAgentRuntimeSnapshot[];
  updatedAt?: number;
}
