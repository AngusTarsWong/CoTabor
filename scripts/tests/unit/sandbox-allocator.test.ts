
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SandboxTabAllocator } from "../../../src/core/orchestrator/runtime/SandboxTabAllocator.js";
import type { SubtaskNode } from "../../../src/core/orchestrator/types/SubtaskDag.js";

function makeNode(id: string, overrides: Partial<SubtaskNode> = {}): SubtaskNode {
  return {
    id,
    title: id,
    dependsOn: [],
    status: "pending",
    attempt: 0,
    maxAttempts: 1,
    metadata: {},
    ...overrides,
  };
}

describe("SandboxTabAllocator", () => {
  it("creates group once and assigns tabs per node in order", async () => {
    const calls: string[] = [];
    let nextTabId = 200;

    const allocator = new SandboxTabAllocator({
      taskName: "parallel page run",
      sourceTabId: 101,
      driver: {
        createGroup: async (title) => { calls.push(`createGroup:${title}`); return 88; },
        destroyGroup: async (groupId) => { calls.push(`destroyGroup:${groupId}`); },
        openTabInGroup: async (url, groupId) => {
          calls.push(`openTab:${groupId}:${url}`);
          return ++nextTabId;
        },
        highlightTab: async (tabId) => { calls.push(`highlight:${tabId}`); },
        getTabUrl: async (tabId) => { calls.push(`getTabUrl:${tabId}`); return "https://source.example/"; },
      },
    });

    const first = await allocator.allocate(makeNode("draft"));
    const second = await allocator.allocate(makeNode("publish", { metadata: { targetUrl: "https://target.example/" } }));

    assert.equal(first.url, "https://source.example/");
    assert.equal(second.url, "https://target.example/");
    assert.equal(allocator.getSnapshot().assignments.length, 2);

    await allocator.highlight("publish");
    await allocator.destroy();

    assert.deepEqual(calls, [
      "getTabUrl:101",
      "createGroup:🤖 DAG: parallel page run",
      "openTab:88:https://source.example/",
      "openTab:88:https://target.example/",
      `highlight:${second.tabId}`,
      "destroyGroup:88",
    ]);
  });

  it("does not create a second group on subsequent allocations", async () => {
    let createGroupCalls = 0;
    const allocator = new SandboxTabAllocator({
      taskName: "multi alloc",
      sourceTabId: 1,
      driver: {
        createGroup: async () => { createGroupCalls++; return 9; },
        destroyGroup: async () => {},
        openTabInGroup: async () => 100,
        highlightTab: async () => {},
        getTabUrl: async () => "https://example.com",
      },
    });

    await allocator.allocate(makeNode("a"));
    await allocator.allocate(makeNode("b"));
    assert.equal(createGroupCalls, 1);
  });
});
