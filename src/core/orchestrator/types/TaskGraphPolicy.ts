export type TaskGraphExecutionMode =
  | "shared_tab"
  | "single_page_serial"
  | "isolated_tabs";

export type TaskGraphResourceProfile =
  | "skill_only"
  | "external_io"
  | "page_read"
  | "page_write";

export interface TaskGraphPolicyWarning {
  code: string;
  message: string;
}

export interface TaskGraphPolicyDecision {
  executionMode: TaskGraphExecutionMode;
  effectiveMaxParallelSubAgents: number;
  warnings: TaskGraphPolicyWarning[];
}
