import { ClawAgent, AgentConfig } from '../../lib/claw/agent';
import { TabGroupManager } from '../tabs/TabGroupManager';
import { cdpClient } from '../../drivers/cdp';

/**
 * Agent 编排器
 * 负责管理复杂任务的生命周期，决定是“伴读模式(单 Tab)”还是“接管模式(多 Tab 标签组沙盒)”
 */
export class AgentOrchestrator {
  private activeAgents: Map<number, ClawAgent> = new Map();
  private activeGroups: Set<number> = new Set();

  /**
   * 伴读模式：在用户当前指定的 Tab 上启动 Agent
   * 不新建页面，不建组，直接在当前页面注入执行
   */
  async runInCurrentTab(config: AgentConfig): Promise<void> {
    const { tabId } = config;
    
    try {
      // 尝试挂载 CDP 获取底层控制权
      await cdpClient.attach(tabId);
    } catch (e: any) {
      config.onLog?.(`[Orchestrator] CDP Attach Failed (可能已被挂载): ${e.message}`);
    }

    const agent = new ClawAgent(config);
    this.activeAgents.set(tabId, agent);

    try {
      await agent.start();
    } finally {
      this.activeAgents.delete(tabId);
      // 任务结束，尝试释放 CDP 控制权
      try {
        await cdpClient.detach(tabId);
      } catch (e) {}
    }
  }

  /**
   * 接管模式：创建一个专属标签组，在后台静默打开多个页面，并分发子 Agent 并行执行
   * 物理级隔离，互不串台。
   */
  async runInSandboxGroup(
    taskName: string,
    urls: string[],
    agentFactory: (tabId: number) => AgentConfig
  ): Promise<void> {
    if (urls.length === 0) return;

    // 1. 创建沙盒标签组
    const groupId = await TabGroupManager.createGroup(`🤖 任务: ${taskName}`, 'purple');
    this.activeGroups.add(groupId);

    const tabIds: number[] = [];

    try {
      // 2. 在后台静默打开所有目标页面
      for (const url of urls) {
        // active: false 保证不打扰用户当前工作
        const tabId = await TabGroupManager.openTabInGroup(url, groupId, false);
        tabIds.push(tabId);
      }

      // 3. 对所有页面挂载 CDP
      for (const tabId of tabIds) {
        await cdpClient.attach(tabId);
      }

      // 4. 并行启动所有子 Agent
      const agentPromises = tabIds.map(async (tabId) => {
        const config = agentFactory(tabId);
        
        // 增强 config 中的 onHumanRequest 钩子，当需要人类接管时，高亮对应的 Tab
        const originalOnHumanRequest = config.onHumanRequest;
        config.onHumanRequest = async (req) => {
          config.onLog?.(`[⚠️ 遇到卡点] 正在将目标页面切至前台，请人工介入...`);
          await TabGroupManager.highlightTab(tabId);
          if (originalOnHumanRequest) {
            originalOnHumanRequest(req);
          }
        };

        const agent = new ClawAgent(config);
        this.activeAgents.set(tabId, agent);
        
        try {
          await agent.start();
        } finally {
          this.activeAgents.delete(tabId);
        }
      });

      await Promise.all(agentPromises);

    } finally {
      // 5. 任务全部结束，一键销毁沙盒
      await TabGroupManager.destroyGroup(groupId);
      this.activeGroups.delete(groupId);
    }
  }

  /**
   * 取消指定的 Agent
   */
  cancelAgent(tabId: number) {
    const agent = this.activeAgents.get(tabId);
    if (agent) {
      // 触发取消逻辑 (需在 Agent 内部支持取消令牌，此处略过具体实现)
      // agent.cancel();
      this.activeAgents.delete(tabId);
    }
  }
}

export const orchestrator = new AgentOrchestrator();
