import type { SubAgentHumanRequest, ObservedSubAgentStatus } from "../../core/orchestrator/types/ResourceRuntime";

export type AgentStatus = ObservedSubAgentStatus | 'idle';

/**
 * A unified view model for representing an agent's execution state across
 * both the Side Panel (Single Agent) and the Swarm Cockpit (Multi-Agent).
 */
export interface UnifiedAgentState {
  /** Task unique identifier (task_run_id) */
  id: string;
  /** Human-readable task title or goal summary */
  title: string;
  /** Current execution status */
  status: AgentStatus;
  /** When the task was started (ms) */
  startedAt: number;
  /** When the state was last updated (ms) */
  updatedAt: number;
  /** Optional: titles of dependencies still blocking this agent */
  waitingFor?: string[];
  /** Optional: Name of the current action/step being executed */
  currentStep?: string;
  /** Optional: Current browser page URL */
  currentUrl?: string;
  /** Optional: Associated browser tab ID */
  tabId?: number;
  /** Number of times the task was replanned */
  replanCount: number;
  /** Number of times a failed action was retried */
  retryCount: number;
  /** Active human intervention request, if any */
  humanRequest?: SubAgentHumanRequest | null;
  /** Optional: Final result summary (on success) or partial summary (so far) */
  summarySoFar?: string;
  /** Optional: Error message (on failure) */
  error?: string;
  /** Links to WorkflowNodeRecord.taskRunId for thought-chain filtering */
  taskRunId?: string;
  /** The original temporary taskRunId generated during execution */
  originalTaskRunId?: string;
}
