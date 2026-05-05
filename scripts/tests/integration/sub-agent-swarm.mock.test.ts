import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSubAgentTask } from "../../../src/core/orchestrator/runtime/SubAgentRunner";
import { SubtaskNode } from "../../../src/core/orchestrator/types/SubtaskDag";
import { LLMMocker } from "../mocks/llm";

describe("Integration: Sub-Agent Swarm Integration", () => {
  it("should inject blackboard facts into the agent goal and extract findings", async () => {
    const mocker = new LLMMocker();
    
    // We expect the goal passed to the LLM to contain our blackboard facts.
    let capturedGoal = "";
    globalThis.__MOCK_STREAM_LLM__ = async (messages: any[]) => {
      // Planner combines system and user prompts into a single user message in some implementations, 
      // or passes them as objects. Let's be robust.
      capturedGoal = messages.map(m => m.content || m[1] || "").join(" ");

      return {
        content: JSON.stringify({
          type: "finish",
          description: "extracted some data",
          extracted_data: { "new_fact": "value_123" }
        }),
        tokenUsage: { prompt: 10, completion: 10, total: 20 },
      };
    };

    const subtask: SubtaskNode = {
      id: "test_node",
      title: "Test Node",
      description: "Do something",
      dependsOn: [],
      attempt: 1,
    };

    const swarmState = {
      blackboard: {
        "existing_key": { value: "existing_val", confidence: 1.0, sourceNodeId: "prev", updatedAt: Date.now() }
      },
      markers: [],
      sharedContext: ["Previous node finished successfully"]
    };

    const result = await runSubAgentTask(
      subtask,
      () => ({ 
        tabId: 1, 
        goal: "ignored", 
        onStep: async () => {} 
      } as any),
      undefined,
      { swarmState }
    );

    // Assertions
    assert.ok(capturedGoal.includes("existing_val"), "Agent goal should include existing blackboard facts");
    assert.ok(capturedGoal.includes("Previous node finished successfully"), "Agent goal should include shared context");
    
    assert.ok(result.success, "Sub-agent should succeed");
    assert.ok(result.swarmStatePatch, "Result should contain a swarm state patch");
    assert.ok(result.swarmStatePatch.blackboard["new_fact"], "Patch should contain the new fact");
    assert.equal(result.swarmStatePatch.blackboard["new_fact"].value, "value_123", "Extracted value should be correct");

    mocker.destroy();
  });
});
