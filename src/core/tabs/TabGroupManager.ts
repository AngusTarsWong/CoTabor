import { cdpClient } from '../../drivers/cdp';

/**
 * Manages sandbox tab groups used by isolated agent runs.
 */
export class TabGroupManager {
  // Tracks the placeholder about:blank tab created per group so it can be
  // removed once the first real tab has been added (Chrome requires ≥1 tab
  // to create a group, but we don't want the blank tab to persist).
  private static placeholderTabs: Map<number, number> = new Map();

  /** Create a new sandbox tab group. */
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
      collapsed: false
    });

    TabGroupManager.placeholderTabs.set(groupId, placeholder.id);
    return groupId;
  }

  /** Open a new tab inside the target sandbox group. */
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

  /** Focus a specific tab when human intervention is required. */
  static async highlightTab(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    await chrome.tabs.update(tabId, { active: true, highlighted: true });
  }

  /** Destroy a sandbox group and close all tabs inside it. */
  static async destroyGroup(groupId: number): Promise<void> {
    const tabsInGroup = await chrome.tabs.query({ groupId });
    const tabIds = tabsInGroup.map(t => t.id).filter((id): id is number => id !== undefined);
    
    // Best-effort CDP cleanup before closing tabs.
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

  /** Close a single tab and detach CDP if needed. */
  static async closeTab(tabId: number): Promise<void> {
    try {
      await cdpClient.detach(tabId);
    } catch (e) {
      // Detach might fail if tab is already closed
    }
    await chrome.tabs.remove(tabId);
  }
}
