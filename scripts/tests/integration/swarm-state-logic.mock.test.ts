import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTaskGraph } from "../../../src/core/orchestrator/runtime/TaskGraphRunner";
import { SubtaskNode, SubtaskDag } from "../../../src/core/orchestrator/types/SubtaskDag";
import { TaskGraphSubtaskResult, TaskGraphTaskInput } from "../../../src/core/orchestrator/types/TaskGraph";
import { SwarmState } from "../../../src/core/orchestrator/types/SwarmState";

describe("Logic: Swarm State Branch & Merge", () => {
  it("should pass blackboard facts from Node A to Node B via the Hive Mind", async () => {
    const tasks: TaskGraphTaskInput[] = [
      {
        id: "node_a",
        title: "Extract Price",
        goal: "Find the price",
      },
      {
        id: "node_b",
        title: "Process Price",
        goal: "Use the price found in node_a",
        dependsOn: ["node_a"],
      },
    ];

    const capturedStates: Record<string, SwarmState> = {};

    const executeSubtask = async (node: SubtaskNode, _dag: SubtaskDag, swarmState: SwarmState): Promise<TaskGraphSubtaskResult> => {
      capturedStates[node.id] = swarmState;

      if (node.id === "node_a") {
        return {
          success: true,
          finalState: { status: "FINISHED" },
          summary: "Found price 999",
          swarmStatePatch: {
            blackboard: {
              price: {
                value: 999,
                confidence: 0.9,
                sourceNodeId: "node_a",
                updatedAt: Date.now(),
              },
            },
          },
        };
      }

      if (node.id === "node_b") {
        return {
          success: true,
          finalState: { status: "FINISHED" },
          summary: "Processed price",
        };
      }

      return { success: false, error: "Unknown node" };
    };

    await runTaskGraph({
      goal: "Test Swarm State",
      tasks,
      executeSubtask,
      maxParallelSubAgents: 1, // Sequential for clear test flow
    });

    // Assertions
    assert.ok(capturedStates["node_a"], "Node A should have been executed");
    assert.deepEqual(capturedStates["node_a"].blackboard, {}, "Node A should start with an empty blackboard");

    assert.ok(capturedStates["node_b"], "Node B should have been executed");
    assert.ok(capturedStates["node_b"].blackboard["price"], "Node B should have received the 'price' fact");
    assert.equal(capturedStates["node_b"].blackboard["price"].value, 999, "Price value should be 999");
    assert.equal(capturedStates["node_b"].blackboard["price"].sourceNodeId, "node_a", "Source should be node_a");
    
    // Verify legacy summary passing still works (merged into sharedContext)
    assert.ok(capturedStates["node_b"].sharedContext.includes("Found price 999"), "Shared context should include Node A's summary");
  });
});
