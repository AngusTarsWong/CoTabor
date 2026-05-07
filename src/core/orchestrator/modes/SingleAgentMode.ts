import { ClawAgent, AgentConfig } from '../../../lib/claw/agent';
import { cdpClient } from '../../../drivers/cdp';
import { getConflictingExtensionName } from '../../../shared/utils/extension-detector';
import { runWithDependencyScheduler } from './DagSchedulerMode';
import type { PlannedAction } from '../../types/history';

export async function runSingleAgentOnTab(
  config: AgentConfig,
  activeAgents: Map<number, ClawAgent>,
  registerDagStop?: (tabId: number, stop: () => Promise<void>) => () => void,
): Promise<void> {
  const { tabId } = config;

  // Only detach in finally if we were the one who attached, to avoid
  // closing an existing debug session the user opened themselves.
  let attachedByCaller = false;
  try {
    await cdpClient.attach(tabId);
    attachedByCaller = true;
  } catch (e: any) {
    const errorMsg = e?.message || String(e);

    if (errorMsg.includes('Cannot access a chrome-extension:// URL of different extension')) {
      let pluginNameInfo = "其他浏览器插件（如翻译、密码管理等）";
      const conflictName = await getConflictingExtensionName(tabId);
      if (conflictName) {
        pluginNameInfo = `【${conflictName}】插件`;
      }
      throw new Error(
        `无法连接到页面 (TabID: ${tabId})。当前页面被${pluginNameInfo}注入了内容，触发了 Chrome 的底层安全限制。建议：1. 刷新页面重试 2. 暂时禁用该插件 3. 在无痕模式下使用。`,
      );
    }

    throw new Error(`无法连接到页面 (TabID: ${tabId})。${errorMsg}`);
  }

  const agent = new ClawAgent(config);
  activeAgents.set(tabId, agent);

  let finalState: any = null;

  try {
    finalState = await agent.start();
  } finally {
    activeAgents.delete(tabId);
    if (attachedByCaller) {
      // detach may fail if the tab was closed or already disconnected
      try { await cdpClient.detach(tabId); } catch { /* expected on tab close */ }
    }
  }

  // Intercept dynamic 'spawn_dag' delegation
  const finalAction = finalState?.planner_output?.action as PlannedAction | undefined;
  if (finalAction?.type === "spawn_dag" && Array.isArray(finalAction.subtasks)) {
    console.log(`[Orchestrator] Intercepted spawn_dag action. Transitioning to Swarm Mode with ${finalAction.subtasks.length} subtasks.`);
    
    // Inject the dynamically generated subtasks into a new config
    const swarmConfig: AgentConfig = {
      ...config,
      subtasks: finalAction.subtasks,
      // Default to isolated tabs for dynamically spawned dags to ensure safety
      executionMode: config.executionMode || "isolated_tabs" 
    };

    // Recursively launch the swarm
    await runWithDependencyScheduler(swarmConfig, activeAgents, registerDagStop);
  }
}
