import { ClawAgent, AgentConfig } from '../../lib/claw/agent';
import { runSingleAgentOnTab } from './modes/SingleAgentMode';
import { runInSandboxGroup } from './modes/SandboxGroupMode';

/**
 * Coordinates agent execution modes and lifecycle.
 * Chooses between single-tab execution and sandboxed multi-tab execution.
 */
export class AgentOrchestrator {
  private activeAgents: Map<number, ClawAgent> = new Map();
  private activeGroups: Set<number> = new Set();
  private activeDagStops: Map<number, () => Promise<void>> = new Map();

  private registerDagStop(tabId: number, stop: () => Promise<void>): () => void {
    this.activeDagStops.set(tabId, stop);
    return () => {
      if (this.activeDagStops.get(tabId) === stop) {
        this.activeDagStops.delete(tabId);
      }
    };
  }

  getActiveAgent(tabId: number): ClawAgent | null {
    return this.activeAgents.get(tabId) ?? null;
  }

  /**
   * Run the agent in the current user-selected tab.
   * No extra tabs or groups are created.
   */
  async runInCurrentTab(config: AgentConfig): Promise<void> {
    await runSingleAgentOnTab(
      config,
      this.activeAgents,
      (tabId, stop) => this.registerDagStop(tabId, stop),
    );
  }

  /**
   * Run multiple agents inside an isolated sandbox tab group.
   */
  async runInSandboxGroup(
    taskName: string,
    urls: string[],
    agentFactory: (tabId: number) => AgentConfig,
  ): Promise<void> {
    await runInSandboxGroup(taskName, urls, agentFactory, this.activeAgents, this.activeGroups);
  }

  async cancelAgent(tabId: number) {
    const stopDag = this.activeDagStops.get(tabId);
    if (stopDag) {
      await stopDag();
      return;
    }

    const agent = this.activeAgents.get(tabId);
    if (agent) {
      await agent.stop();
    }
  }
}

export const orchestrator = new AgentOrchestrator();
