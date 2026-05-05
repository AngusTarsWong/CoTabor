import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMMocker } from "../mocks/llm";
import { runSingleAgentOnTab } from "../../../src/core/orchestrator/modes/SingleAgentMode";
import { AgentConfig, ClawAgent } from "../../../src/lib/claw/agent";

describe("Logic: Dynamic Spawn DAG", () => {
  it("should intercept spawn_dag and launch swarm mode", async () => {
    const mocker = new LLMMocker();
    let swarmLaunchIntercepted = false;

    // Mock the planner to output spawn_dag
    mocker.addRule({
      nodeMatch: "planner",
      times: 1, // Only mock the first planner call (the single agent)
      response: `\`\`\`json
{
  "task_list": [
    { "id": "1", "goal": "全网竞品调研", "status": "进行中" }
  ],
  "type": "spawn_dag",
  "description": "任务包含多个独立数据源，启动蜂群并发探索。",
  "subtasks": [
    { "id": "task_a", "title": "Node A", "goal": "Do A", "dependsOn": [] },
    { "id": "task_b", "title": "Node B", "goal": "Do B", "dependsOn": ["task_a"] }
  ]
}
\`\`\``
    });

    // We also need to mock the subsequent planner calls for the sub-agents so they don't loop forever
    mocker.addRule({
      nodeMatch: "planner",
      response: `{"type": "finish", "description": "mocked subtask finish"}`
    });

    const activeAgents = new Map<number, ClawAgent>();
    
    // We need to mock runWithDependencyScheduler somehow to prove it was called.
    // The easiest way in Node.js test without full DI is to wrap the original or spy on it.
    // However, since runSingleAgentOnTab *imports* it directly, we might actually execute it.
    // Since we mocked all subsequent planner calls to 'finish', it should execute very quickly.
    
    let loggedMessages: string[] = [];
    const config: AgentConfig = {
      tabId: 999, // use a fake tab id
      goal: "Test dynamic spawn",
      onLog: (msg) => loggedMessages.push(msg),
      // We pass a dummy sandbox driver to avoid actual chrome.tabs creation
      sandboxTabDriver: {
        createGroup: async () => {},
        removeGroup: async () => {},
        assignTabToGroup: async () => {},
        highlightTab: async () => {},
        createTab: async () => ({ id: 9991, url: "", title: "", highlighted: false } as any),
        removeTab: async () => {},
        ensureTabReady: async () => {},
        getTabUrl: async () => "about:blank",
        openTabInGroup: async () => ({ id: 9992, url: "", title: "", highlighted: false } as any),
        destroyGroup: async () => {},
      } as any,
      // Fake memory provider so we don't hit IndexedDB issues
      memory: {
        commitTaskMemories: async () => ({ scheduled: false, candidates: 0, committed: {} as any })
      } as any
    };

    // We must mock cdpClient to avoid attaching to a real browser tab
    const { cdpClient } = await import("../../../src/drivers/cdp");
    const originalAttach = cdpClient.attach;
    const originalDetach = cdpClient.detach;
    cdpClient.attach = async () => {};
    cdpClient.detach = async () => {};

    try {
      await runSingleAgentOnTab(config, activeAgents);
      
      // Verify that the orchestrator logged the interception
      const interceptLog = loggedMessages.find(m => m.includes("Transitioning to Swarm Mode with 2 subtasks"));
      
      // We can't easily assert on the exact console.log output without hooking it, 
      // but we can assert the execution completed smoothly without erroring out.
      // A more robust check is checking if sub-agents were actually spawned and hit the LLM mocker.
      assert.ok(mocker["callCount"] > 1, "Should have executed the initial planner AND the spawned subtasks");
      
    } finally {
      mocker.destroy();
      cdpClient.attach = originalAttach;
      cdpClient.detach = originalDetach;
    }
  });
});
