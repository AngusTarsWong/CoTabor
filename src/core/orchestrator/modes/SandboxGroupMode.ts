import { ClawAgent, AgentConfig } from '../../../lib/claw/agent';
import { TabGroupManager } from '../../tabs/TabGroupManager';
import { cdpClient } from '../../../drivers/cdp';
import { log } from '../../../shared/utils/log';

export async function runInSandboxGroup(
  taskName: string,
  urls: string[],
  agentFactory: (tabId: number) => AgentConfig,
  activeAgents: Map<number, ClawAgent>,
  activeGroups: Set<number>,
): Promise<void> {
  if (urls.length === 0) return;

  const groupId = await TabGroupManager.createGroup(`🤖 任务: ${taskName}`, 'purple');
  activeGroups.add(groupId);

  const tabIds: number[] = [];

  try {
    for (const url of urls) {
      const tabId = await TabGroupManager.openTabInGroup(url, groupId, false);
      tabIds.push(tabId);
    }

    for (const tabId of tabIds) {
      await cdpClient.attach(tabId);
    }

    const agentPromises = tabIds.map(async (tabId) => {
      const config = agentFactory(tabId);

      const originalOnHumanRequest = config.onHumanRequest;
      config.onHumanRequest = async (req) => {
        await TabGroupManager.highlightTab(tabId);
        originalOnHumanRequest?.(req);
      };

      const agent = new ClawAgent(config);
      activeAgents.set(tabId, agent);

      try {
        await agent.start();
      } finally {
        activeAgents.delete(tabId);
      }
    });

    const results = await Promise.allSettled(agentPromises);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        log.error(`[Orchestrator] Agent on tab ${tabIds[i]} failed:`, r.reason);
      }
    });
  } finally {
    await TabGroupManager.destroyGroup(groupId);
    activeGroups.delete(groupId);
  }
}
