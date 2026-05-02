import { ClawAgent, AgentConfig } from '../../lib/claw/agent';
import { runSingleAgentOnTab } from './modes/SingleAgentMode';
import { runWithDependencyScheduler, shouldUseScheduler } from './modes/DagSchedulerMode';
import { runInSandboxGroup } from './modes/SandboxGroupMode';

/**
 * Coordinates agent execution modes and lifecycle.
 * Chooses between single-tab execution and sandboxed multi-tab execution.
 */
export class AgentOrchestrator {
  private activeAgents: Map<number, ClawAgent> = new Map();
  private activeGroups: Set<number> = new Set();

  getActiveAgent(tabId: number): ClawAgent | null {
    return this.activeAgents.get(tabId) ?? null;
  }

  /**
   * Run the agent in the current user-selected tab.
   * No extra tabs or groups are created.
   */
  async runInCurrentTab(config: AgentConfig): Promise<void> {
    if (shouldUseScheduler(config)) {
      await runWithDependencyScheduler(config, this.activeAgents);
      return;
    }
    await runSingleAgentOnTab(config, this.activeAgents);
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
    const agent = this.activeAgents.get(tabId);
    if (agent) {
      await agent.stop();
    }
  }
}

export const orchestrator = new AgentOrchestrator();
