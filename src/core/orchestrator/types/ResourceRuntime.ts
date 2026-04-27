export interface SandboxTabAssignment {
  nodeId: string;
  tabId: number;
  url: string;
}

export interface SandboxRuntimeSnapshot {
  groupId: number | null;
  assignments: SandboxTabAssignment[];
}

