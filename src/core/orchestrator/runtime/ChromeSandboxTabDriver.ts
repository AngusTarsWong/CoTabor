import { TabGroupManager } from "../../tabs/TabGroupManager";
import type { SandboxTabDriver } from "./SandboxTabAllocator";

export class ChromeSandboxTabDriver implements SandboxTabDriver {
  async createGroup(title: string, color: chrome.tabGroups.ColorEnum = "purple"): Promise<number> {
    return await TabGroupManager.createGroup(title, color);
  }

  async destroyGroup(groupId: number): Promise<void> {
    await TabGroupManager.destroyGroup(groupId);
  }

  async openTabInGroup(url: string, groupId: number, active: boolean = false): Promise<number> {
    return await TabGroupManager.openTabInGroup(url, groupId, active);
  }

  async highlightTab(tabId: number): Promise<void> {
    await TabGroupManager.highlightTab(tabId);
  }

  async getTabUrl(tabId: number): Promise<string> {
    const tab = await chrome.tabs.get(tabId);
    return tab.url?.trim() || "about:blank";
  }
}

