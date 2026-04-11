import { cdpClient } from '../../drivers/cdp';

/**
 * 标签组管理器
 * 负责沙盒化 Agent 操作页面的生命周期，通过 chrome.tabs 和 chrome.tabGroups 实现可视化与隔离
 */
export class TabGroupManager {
  // Tracks the placeholder about:blank tab created per group so it can be
  // removed once the first real tab has been added (Chrome requires ≥1 tab
  // to create a group, but we don't want the blank tab to persist).
  private static placeholderTabs: Map<number, number> = new Map();

  /**
   * 创建一个新的沙盒标签组
   * @param title 标签组的名称，默认 🤖 CoTabor 任务
   * @param color 标签组颜色，默认 purple
   */
  static async createGroup(title: string = '🤖 CoTabor 任务', color: chrome.tabGroups.ColorEnum = 'purple'): Promise<number> {
    // Chrome requires at least one tab to create a group, so we open a
    // temporary about:blank tab. It will be closed by openTabInGroup() once
    // the first real tab joins the group.
    const placeholder = await chrome.tabs.create({ url: 'about:blank', active: false });
    if (!placeholder.id) throw new Error('Failed to create background tab');

    const groupId = await chrome.tabs.group({ tabIds: placeholder.id });
    await chrome.tabGroups.update(groupId, {
      title,
      color,
      collapsed: false // 默认展开，让用户能看到
    });

    TabGroupManager.placeholderTabs.set(groupId, placeholder.id);
    return groupId;
  }

  /**
   * 在指定的沙盒组内打开新 Tab
   * @param url 要打开的链接
   * @param groupId 目标组 ID
   * @param active 是否将页面放到前台 (默认 false, 后台静默执行)
   */
  static async openTabInGroup(url: string, groupId: number, active: boolean = false): Promise<number> {
    const tab = await chrome.tabs.create({ url, active });
    if (!tab.id) throw new Error('Failed to create tab in group');

    await chrome.tabs.group({ tabIds: tab.id, groupId });

    // Close the placeholder about:blank tab now that a real tab is in the group
    const placeholderTabId = TabGroupManager.placeholderTabs.get(groupId);
    if (placeholderTabId) {
      TabGroupManager.placeholderTabs.delete(groupId);
      try { await chrome.tabs.remove(placeholderTabId); } catch (e) { /* already closed */ }
    }

    return tab.id;
  }

  /**
   * 需要人工接管时，高亮并激活特定的 Tab
   * @param tabId 需要接管的 Tab
   */
  static async highlightTab(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      // 把窗口切到前台
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    // 把 Tab 切到前台并高亮
    await chrome.tabs.update(tabId, { active: true, highlighted: true });
  }

  /**
   * 任务结束，销毁整个标签组及内部的所有 Tab
   * @param groupId 要销毁的组 ID
   */
  static async destroyGroup(groupId: number): Promise<void> {
    const tabsInGroup = await chrome.tabs.query({ groupId });
    const tabIds = tabsInGroup.map(t => t.id).filter((id): id is number => id !== undefined);
    
    // 先尝试卸载所有 CDP (容错处理)
    for (const tabId of tabIds) {
      try {
        await cdpClient.detach(tabId);
      } catch (e) {
        // ignore detach error
      }
    }
    
    if (tabIds.length > 0) {
      await chrome.tabs.remove(tabIds);
    }
  }

  /**
   * 移除指定 Tab，并清理可能挂载的 CDP
   */
  static async closeTab(tabId: number): Promise<void> {
    try {
      await cdpClient.detach(tabId);
    } catch (e) {}
    await chrome.tabs.remove(tabId);
  }
}
