import assert from "node:assert/strict";
import { runTaskGraph } from "../../../src/core/orchestrator/runtime/TaskGraphRunner";
import { SandboxTabAllocator } from "../../../src/core/orchestrator/runtime/SandboxTabAllocator";

async function main() {
  const resourceEvents: Array<{ groupId: number | null; assignments: Array<{ nodeId: string; tabId: number; url: string }> }> = [];
  const driverCalls: string[] = [];
  let nextTabId = 500;

  const allocator = new SandboxTabAllocator({
    taskName: "isolated dag integration",
    sourceTabId: 42,
    driver: {
      createGroup: async (title) => {
        driverCalls.push(`createGroup:${title}`);
        return 9001;
      },
      destroyGroup: async (groupId) => {
        driverCalls.push(`destroyGroup:${groupId}`);
      },
      openTabInGroup: async (url, groupId) => {
        driverCalls.push(`openTab:${groupId}:${url}`);
        nextTabId += 1;
        return nextTabId;
      },
      highlightTab: async (tabId) => {
        driverCalls.push(`highlight:${tabId}`);
      },
      getTabUrl: async (tabId) => {
        driverCalls.push(`getTabUrl:${tabId}`);
        return "https://workspace.example/source";
      },
    },
  });

  let executionMode = "shared_tab";
  const executionOrder: string[] = [];

  try {
    const result = await runTaskGraph({
      goal: "isolated tabs dag",
      executionMode: "isolated_tabs",
      maxParallelSubAgents: 2,
      tasks: [
        {
          id: "collect_a",
          title: "Collect A",
          resourceProfile: "page_write",
          metadata: { targetUrl: "https://workspace.example/a" },
        },
        {
          id: "collect_b",
          title: "Collect B",
          resourceProfile: "page_write",
          metadata: { targetUrl: "https://workspace.example/b" },
        },
        {
          id: "publish",
          title: "Publish",
          dependsOn: ["collect_a", "collect_b"],
          resourceProfile: "external_io",
        },
      ],
      onPolicyResolved: (decision) => {
        executionMode = decision.executionMode;
      },
      executeSubtask: async (node, dag) => {
        executionOrder.push(node.id);

        if (executionMode === "isolated_tabs") {
          await allocator.allocate(node);
          resourceEvents.push(allocator.getSnapshot());
        }

        const predecessorCount = node.dependsOn
          .map((depId) => dag.nodes[depId]?.outputRef?.summary)
          .filter(Boolean).length;

        return {
          success: true,
          summary: predecessorCount > 0 ? `${node.id}:fanin_${predecessorCount}` : `${node.id}:ready`,
        };
      },
    });

    assert.equal(executionMode, "isolated_tabs");
    assert.deepEqual(result.schedulerRuntime.failed, []);
    assert.ok(executionOrder.includes("collect_a"));
    assert.ok(executionOrder.includes("collect_b"));
    assert.equal(result.subtaskResults.publish.summary, "publish:fanin_2");

    const finalSnapshot = allocator.getSnapshot();
    assert.equal(finalSnapshot.groupId, 9001);
    assert.equal(finalSnapshot.assignments.length, 3);
    assert.equal(finalSnapshot.assignments[0].url, "https://workspace.example/a");
    assert.equal(finalSnapshot.assignments[1].url, "https://workspace.example/b");
    assert.equal(finalSnapshot.assignments[2].url, "https://workspace.example/source");
    assert.equal(resourceEvents.length, 3);
  } finally {
    await allocator.destroy();
  }

  assert.deepEqual(driverCalls, [
    "getTabUrl:42",
    "createGroup:🤖 DAG: isolated dag integration",
    "openTab:9001:https://workspace.example/a",
    "openTab:9001:https://workspace.example/b",
    "openTab:9001:https://workspace.example/source",
    "destroyGroup:9001",
  ]);

  console.log("✅ isolated_tabs sandbox DAG integration passed");
}

main().catch((error) => {
  console.error("❌ isolated_tabs sandbox DAG integration failed");
  console.error(error);
  process.exit(1);
});
