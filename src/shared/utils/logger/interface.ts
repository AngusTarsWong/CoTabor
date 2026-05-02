
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from "../../types/memory";

export interface LoggerConfig {
  goal: string;
  tabId: number;
  timestamp: number;
}

export interface IAgentLogger {
  /** Initialize the logging session. */
  init(config: LoggerConfig): Promise<void>;

  /**
   * Record one node-level execution step.
   * @param step Contains the node name and its state update payload.
   */
  logStep(step: { node: string; update: any }): Promise<void>;

  /**
   * Finalize logs when the task completes.
   * @param finalState Final orchestrator state.
   */
  finish(finalState: any): Promise<void>;

  /** Optional public or internal URL for the stored log artifact. */
  getLogUrl?(): string;
}

export interface IAgentMemory {
  commitTaskMemories(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult>;
}
