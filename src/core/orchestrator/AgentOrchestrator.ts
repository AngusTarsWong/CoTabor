import { ClawAgent, AgentConfig } from '../../lib/claw/agent';
import { TabGroupManager } from '../tabs/TabGroupManager';
import { cdpClient } from '../../drivers/cdp';
import { getConflictingExtensionName } from '../../shared/utils/extension-detector';
import { ENV } from '../../shared/constants/env';
import { buildSubtaskDag } from './planning/DependencyExtractor';
import { validateSubtaskDag } from './planning/DagValidator';
import { DependencyScheduler } from './scheduler/DependencyScheduler';
import { nextLaunchBatch } from './scheduler/ReadyQueue';
import { runSubAgentTask } from './runtime/SubAgentRunner';
import type { SubtaskNode } from './types/SubtaskDag';

/**
 * Agent 编排器
 * 负责管理复杂任务的生命周期，决定是“伴读模式(单 Tab)”还是“接管模式(多 Tab 标签组沙盒)”
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
    if (this.shouldUseScheduler(config)) {
      await this.runWithDependencyScheduler(config);
      return;
    }

    await this.runSingleAgentOnTab(config);
  }

  private async runSingleAgentOnTab(config: AgentConfig): Promise<void> {
    const { tabId } = config;

    // 只在自己成功 attach 的情况下才在 finally 中 detach，避免断掉用户已有的调试会话
    let attachedByCaller = false;
    try {
      await cdpClient.attach(tabId);
      attachedByCaller = true;
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      config.onLog?.(`[Orchestrator] CDP Attach Failed: ${errorMsg}`);

      // 专门处理其他插件 iframe 注入导致的 Chrome 底层安全限制
      if (errorMsg.includes('Cannot access a chrome-extension:// URL of different extension')) {
        let pluginNameInfo = "其他浏览器插件（如翻译、密码管理等）";
        const conflictName = await getConflictingExtensionName(tabId);
        if (conflictName) {
          pluginNameInfo = `【${conflictName}】插件`;
        }
        throw new Error(`无法连接到页面 (TabID: ${tabId})。当前页面被${pluginNameInfo}注入了内容，触发了 Chrome 的底层安全限制。建议：1. 刷新页面重试 2. 暂时禁用该插件 3. 在无痕模式下使用。`);
      }

      // 如果 attach 失败，抛出异常阻止执行
      // 避免后续 CDP 操作因为未成功 attach 而失败
      throw new Error(`无法连接到页面 (TabID: ${tabId})。${errorMsg}`);
    }

    const agent = new ClawAgent(config);
    this.activeAgents.set(tabId, agent);

    try {
      await agent.start();
    } finally {
      this.activeAgents.delete(tabId);
      if (attachedByCaller) {
        try { await cdpClient.detach(tabId); } catch (e) {}
      }
    }
  }

  private shouldUseScheduler(config: AgentConfig): boolean {
    return Boolean(ENV.MULTI_AGENT_SCHEDULER && config.subtasks && config.subtasks.length > 0);
  }

  private async runWithDependencyScheduler(config: AgentConfig): Promise<void> {
    const rawSubtasks = config.subtasks || [];
    const dag = buildSubtaskDag({ tasks: rawSubtasks });
    const validation = validateSubtaskDag(dag);

    if (!validation.valid) {
      config.onLog?.(`[Orchestrator] Invalid subtask DAG, fallback to single-agent: ${validation.errors.join('; ')}`);
      await this.runSingleAgentOnTab(config);
      return;
    }

    dag.roots = validation.roots;
    dag.topoOrder = validation.topoOrder;
    dag.hasCycle = false;

    const scheduler = new DependencyScheduler(dag, `scheduler_${Date.now()}`);
    const maxParallel = Math.max(1, config.maxParallelSubAgents || 2);

    while (true) {
      const launchIds = nextLaunchBatch(scheduler, maxParallel);
      if (launchIds.length === 0) {
        if (scheduler.isDone()) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }

      const batch = launchIds.map(async (id) => {
        const node = scheduler.getDag().nodes[id];
        if (!node) return;

        const result = await runSubAgentTask(node, (_subtask: SubtaskNode) => ({
          ...config,
          subtasks: undefined,
          maxParallelSubAgents: undefined,
          goal: `${config.goal} :: ${node.title}`,
        }));

        scheduler.markResult({
          id,
          success: result.success,
          outputRef: result.success
            ? {
                id: `output_${id}_${Date.now()}`,
                summary: result.finalState?.planner_output?.action?.description || result.finalState?.summary,
                createdAt: Date.now(),
              }
            : undefined,
          error: result.success
            ? undefined
            : {
                code: "sub_agent_failed",
                message: result.error?.message || "Sub-agent failed",
                retryable: true,
              },
        });
      });

      await Promise.all(batch);

      if (scheduler.isDone()) {
        break;
      }
    }

    const runtime = scheduler.getState();
    if (runtime.failed.length > 0) {
      throw new Error(`Dependency scheduler failed subtasks: ${runtime.failed.join(', ')}`);
    }

    config.onFinish?.({
      status: "FINISHED",
      scheduler_runtime: runtime,
      subtask_dag: scheduler.getDag(),
    });
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

      const results = await Promise.allSettled(agentPromises);
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[Orchestrator] Agent on tab ${tabIds[i]} failed:`, r.reason);
        }
      });

    } finally {
      // 5. 任务全部结束，一键销毁沙盒
      await TabGroupManager.destroyGroup(groupId);
      this.activeGroups.delete(groupId);
    }
  }

  /**
   * 取消指定的 Agent
   */
  async cancelAgent(tabId: number) {
    const agent = this.activeAgents.get(tabId);
    if (agent) {
      await agent.stop();
    }
  }
}

export const orchestrator = new AgentOrchestrator();
