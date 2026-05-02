import { ClawAgent, AgentConfig } from '../../lib/claw/agent';
import { runSingleAgentOnTab } from './modes/SingleAgentMode';
import { runWithDependencyScheduler, shouldUseScheduler } from './modes/DagSchedulerMode';
import { runInSandboxGroup } from './modes/SandboxGroupMode';

/**
 * Agent 编排器
 * 负责管理复杂任务的生命周期，决定是"伴读模式(单 Tab)"还是"接管模式(多 Tab 标签组沙盒)"
 */
export class AgentOrchestrator {
  private activeAgents: Map<number, ClawAgent> = new Map();
  private activeGroups: Set<number> = new Set();

  getActiveAgent(tabId: number): ClawAgent | null {
    return this.activeAgents.get(tabId) ?? null;
  }

  /**
   * 伴读模式：在用户当前指定的 Tab 上启动 Agent
   * 不新建页面，不建组，直接在当前页面注入执行
   */
  async runInCurrentTab(config: AgentConfig): Promise<void> {
    if (shouldUseScheduler(config)) {
      await runWithDependencyScheduler(config, this.activeAgents);
      return;
    }
    await runSingleAgentOnTab(config, this.activeAgents);
  }

  /**
   * 接管模式：创建一个专属标签组，在后台静默打开多个页面，并分发子 Agent 并行执行
   * 物理级隔离，互不串台。
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
