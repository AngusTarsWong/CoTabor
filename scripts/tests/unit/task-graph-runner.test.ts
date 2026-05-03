
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTaskGraph, extractTaskGraphSummary } from "../../../src/core/orchestrator/runtime/TaskGraphRunner.js";

describe("runTaskGraph", () => {
  it("aggregates results and releases fan-in nodes after both predecessors complete", async () => {
    const executionOrder: string[] = [];

    const result = await runTaskGraph({
      goal: "demo dag",
      tasks: [
        { id: "draft_intro", title: "Draft intro" },
        { id: "draft_body", title: "Draft body" },
        { id: "publish", title: "Publish", dependsOn: ["draft_intro", "draft_body"] },
      ],
      maxParallelSubAgents: 2,
      executeSubtask: async (node, dag) => {
        executionOrder.push(node.id);
        const predecessorCount = node.dependsOn
          .map((depId) => dag.nodes[depId]?.outputRef?.summary)
          .filter(Boolean).length;
        return {
          success: true,
          finalState: {
            planner_output: {
              action: {
                description:
                  predecessorCount > 0
                    ? `${node.id}:uses_${predecessorCount}`
                    : `${node.id}:ready`,
              },
            },
          },
        };
      },
    });

    assert.deepEqual(result.schedulerRuntime.failed, []);
    assert.deepEqual(result.schedulerRuntime.blocked, []);
    assert.ok(executionOrder.includes("draft_intro"));
    assert.ok(executionOrder.includes("draft_body"));
    // publish must run after both parents
    assert.ok(executionOrder.indexOf("publish") > executionOrder.indexOf("draft_intro"));
    assert.ok(executionOrder.indexOf("publish") > executionOrder.indexOf("draft_body"));
    assert.equal(result.subtaskResults.publish.summary, "publish:uses_2");
  });

  it("marks downstream nodes as blocked when a prerequisite fails", async () => {
    const result = await runTaskGraph({
      goal: "fail chain",
      tasks: [
        { id: "a", title: "A", maxAttempts: 1 },
        { id: "b", title: "B", dependsOn: ["a"] },
      ],
      maxParallelSubAgents: 2,
      executeSubtask: async (node) => ({
        success: node.id !== "a",
        finalState: {},
        error: node.id === "a" ? "A failed" : undefined,
      }),
    });

    assert.ok(result.schedulerRuntime.failed.includes("a"));
    assert.ok(result.schedulerRuntime.blocked.includes("b"));
  });
});

describe("extractTaskGraphSummary", () => {
  it("extracts planner_output description as summary", () => {
    const summary = extractTaskGraphSummary({
      planner_output: { action: { description: "Task completed" } },
    });
    assert.equal(summary, "Task completed");
  });

  it("returns empty string when no planner output", () => {
    const summary = extractTaskGraphSummary({});
    assert.equal(summary, "");
  });
});
