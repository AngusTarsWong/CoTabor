export type SubtaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled";

export interface SubtaskError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SubtaskOutputRef {
  id: string;
  uri?: string;
  summary?: string;
  payload?: unknown;
  payloadType?: "table" | "list" | "object" | "url_list" | "text";
  createdAt: number;
}

export interface SubtaskNode {
  id: string;
  title: string;
  description?: string;
  dependsOn: string[];
  status: SubtaskStatus;
  attempt: number;
  maxAttempts: number;
  assignedAgentId?: string;
  outputRef?: SubtaskOutputRef;
  error?: SubtaskError;
  metadata?: Record<string, any>;
}

export interface SubtaskDag {
  nodes: Record<string, SubtaskNode>;
  roots: string[];
  topoOrder?: string[];
  hasCycle: boolean;
}

export interface DagValidationResult {
  valid: boolean;
  errors: string[];
  roots: string[];
  topoOrder: string[];
}
