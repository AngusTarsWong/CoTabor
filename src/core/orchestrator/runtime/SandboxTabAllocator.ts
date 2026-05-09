import type { SubtaskNode } from "../types/SubtaskDag";
import type { SandboxRuntimeSnapshot, SandboxTabAssignment } from "../types/ResourceRuntime";

export interface SandboxTabDriver {
  createGroup(title: string, color?: chrome.tabGroups.ColorEnum): Promise<number>;
  destroyGroup(groupId: number): Promise<void>;
  openTabInGroup(url: string, groupId: number, active?: boolean): Promise<number>;
  highlightTab(tabId: number): Promise<void>;
  getTabUrl(tabId: number): Promise<string>;
}

export interface SandboxTabAllocatorConfig {
  taskName: string;
  sourceTabId: number;
  driver: SandboxTabDriver;
  groupColor?: chrome.tabGroups.ColorEnum;
}

function pickNodeTargetUrl(node: SubtaskNode): string | undefined {
  const candidates = [
    node.metadata?.targetUrl,
    node.metadata?.url,
    node.metadata?.pageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

export class SandboxTabAllocator {
  private groupId: number | null = null;
  private sourceTabUrl: string | null = null;
  private assignments = new Map<string, SandboxTabAssignment>();
  private initializationPromise: Promise<void> | null = null;
  private cockpitTabId: number | null = null;

  constructor(private readonly config: SandboxTabAllocatorConfig) {}

  async allocate(node: SubtaskNode): Promise<SandboxTabAssignment> {
    const existing = this.assignments.get(node.id);
    if (existing) {
      return existing;
    }

    await this.ensureReady();
    const groupId = this.groupId;
    if (groupId === null) {
      throw new Error("Sandbox tab group is not initialized.");
    }

    const url = pickNodeTargetUrl(node) ?? this.sourceTabUrl ?? "about:blank";
    const tabId = await this.config.driver.openTabInGroup(url, groupId, false);
    const assignment: SandboxTabAssignment = {
      nodeId: node.id,
      tabId,
      url,
    };
    this.assignments.set(node.id, assignment);
    return assignment;
  }

  async highlight(nodeId: string): Promise<void> {
    const assignment = this.assignments.get(nodeId);
    if (!assignment) return;
    await this.config.driver.highlightTab(assignment.tabId);
  }

  getSnapshot(): SandboxRuntimeSnapshot {
    return {
      groupId: this.groupId,
      cockpitTabId: this.cockpitTabId ?? undefined,
      assignments: [...this.assignments.values()],
    };
  }

  /**
   * Tracks the swarm cockpit tab ID. The actual grouping is handled by the UI layer
   * to ensure the cockpit is unified with the sandbox tab group.
   */
  async addCockpitTab(cockpitTabId: number): Promise<void> {
    this.cockpitTabId = cockpitTabId;
  }

  async destroy(): Promise<void> {
    if (this.groupId === null) {
      return;
    }

    const groupId = this.groupId;
    this.groupId = null;
    this.assignments.clear();
    await this.config.driver.destroyGroup(groupId);
  }

  private async ensureReady(): Promise<void> {
    if (this.groupId !== null) {
      return;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        try {
          this.sourceTabUrl = await this.config.driver.getTabUrl(this.config.sourceTabId);
          this.groupId = await this.config.driver.createGroup(
            `🐝 ${this.config.taskName.slice(0, 20)}`,
            this.config.groupColor ?? "purple",
          );
        } catch (error) {
          this.initializationPromise = null;
          throw error;
        }
      })();
    }

    await this.initializationPromise;
  }
}
