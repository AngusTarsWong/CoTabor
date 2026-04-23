import type { ClawAgent, AgentConfig } from "../lib/claw/agent";

export type CreateAgentConfig = Omit<AgentConfig, "tabId"> & { tabId?: number };

export interface SyncResult {
  pushed: number;
  failed: number;
}

export interface AgentRuntime {
  /** Virtual tab ID assigned by this runtime */
  tabId: number;
  /** Puppeteer page (Node.js only, undefined in extension) */
  page?: any;
  /** Create a ClawAgent bound to this runtime's tab */
  createAgent(config: CreateAgentConfig): ClawAgent;
  /**
   * Schedule the experience job (if finalState provided), then flush the
   * memory sync queue to Notion/Feishu.
   *
   * Pass the agent finalState from onFinish to also trigger experience
   * extraction (L1/L2/L3 classification) before syncing.
   *
   * In extension mode this is a no-op (useMemorySync handles polling).
   */
  syncMemory(finalState?: any): Promise<void>;
  /** Release resources (close browser in Node.js) */
  cleanup(): Promise<void>;
}
