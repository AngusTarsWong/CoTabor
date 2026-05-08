import type { Browser, Page } from "puppeteer-core";
import type { SandboxTabDriver } from "../core/orchestrator/runtime/SandboxTabAllocator";
import { closeSandboxPageSafely } from "./sandbox-cleanup";

export interface NodeTabRegistry {
  registerPage(tabId: number, page: Page): void;
  unregisterPage(tabId: number): void;
  setVirtualTabAutoSwitchEnabled?(enabled: boolean): void;
}

export class NodeSandboxTabDriver implements SandboxTabDriver {
  private nextGroupId = 10000;
  private nextTabId = 20000;
  private groups = new Map<number, Set<number>>();
  private pages = new Map<number, Page>();

  constructor(
    private readonly browser: Browser,
    private readonly tabRegistry: NodeTabRegistry,
    private readonly sourcePage: Page,
    private readonly sourceTabId: number = 999999,
  ) {}

  async createGroup(_title: string): Promise<number> {
    const groupId = this.nextGroupId++;
    this.groups.set(groupId, new Set());
    this.tabRegistry.setVirtualTabAutoSwitchEnabled?.(false);
    return groupId;
  }

  async destroyGroup(groupId: number): Promise<void> {
    const tabIds = [...(this.groups.get(groupId) ?? [])];
    this.groups.delete(groupId);

    for (const tabId of tabIds) {
      const page = this.pages.get(tabId);
      this.pages.delete(tabId);
      this.tabRegistry.unregisterPage(tabId);
      await closeSandboxPageSafely(page);
    }

    if (this.groups.size === 0) {
      this.tabRegistry.registerPage(this.sourceTabId, this.sourcePage);
      this.tabRegistry.setVirtualTabAutoSwitchEnabled?.(true);
    }
  }

  async openTabInGroup(url: string, groupId: number, active: boolean = false): Promise<number> {
    const page = await this.browser.newPage();
    const tabId = this.nextTabId++;
    this.pages.set(tabId, page);
    this.tabRegistry.registerPage(tabId, page);

    const group = this.groups.get(groupId);
    if (group) {
      group.add(tabId);
    }
    page.on("popup", (popup) => {
      if (!popup) return;
      const popupTabId = this.nextTabId++;
      this.pages.set(popupTabId, popup);
      this.tabRegistry.registerPage(popupTabId, popup);
      this.groups.get(groupId)?.add(popupTabId);
    });

    await page.goto(url || "about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
    if (active) {
      await page.bringToFront().catch(() => {});
    }

    return tabId;
  }

  async highlightTab(tabId: number): Promise<void> {
    const page = this.pages.get(tabId);
    if (page && !page.isClosed()) {
      await page.bringToFront().catch(() => {});
    }
  }

  async getTabUrl(tabId: number): Promise<string> {
    const page = this.pages.get(tabId);
    if (page && !page.isClosed()) {
      return page.url() || "about:blank";
    }
    if (tabId === this.sourceTabId) {
      return this.sourcePage.url() || "about:blank";
    }
    return "about:blank";
  }
}
