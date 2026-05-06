import "fake-indexeddb/auto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTaskGraph } from "../../../src/core/orchestrator/runtime/TaskGraphRunner";
import { runWithDependencyScheduler } from "../../../src/core/orchestrator/modes/DagSchedulerMode";
import { setPageDriver } from "../../../src/drivers/page/index";
import type { AgentConfig } from "../../../src/lib/claw/agent";
import type { ClawAgent } from "../../../src/lib/claw/agent";

// LangGraph internals need sessionStorage in Node.js context.
if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Orchestrator layer — notebook snapshot handoff via runTaskGraph
// ─────────────────────────────────────────────────────────────────────────────

describe("Unit: Notebook Handoff — Orchestrator Layer", () => {
  it("should pass accumulated notebook from completed agents to dependent agents", async () => {
    const receivedSnapshots: Record<string, Record<string, any>> = {};

    await runTaskGraph({
      goal: "多站点比价",
      tasks: [
        { id: "agent_a", title: "查询京东价格", description: "获取京东价格" },
        { id: "agent_b", title: "汇总比价报告", description: "汇总结果", dependsOn: ["agent_a"] },
      ],
      executeSubtask: async (node, _dag, notebookSnapshot) => {
        receivedSnapshots[node.id] = { ...notebookSnapshot };

        if (node.id === "agent_a") {
          return {
            success: true,
            finalState: {
              status: "FINISHED",
              long_term_memory: { summary: "", notebook: { jd_price: "5000", product_name: "MacBook Pro" } },
              total_history: [{ step: 1, action: { type: "finish", description: "Done" }, result: null, step_summary: "Done" }],
            },
          };
        }

        return {
          success: true,
          finalState: {
            status: "FINISHED",
            long_term_memory: { summary: "", notebook: { comparison_done: true } },
            total_history: [{ step: 1, action: { type: "finish", description: "Done" }, result: null, step_summary: "Done" }],
          },
        };
      },
      onRoundStart: () => {},
    });

    // Agent A starts with an empty notebook (no predecessors).
    assert.deepEqual(receivedSnapshots["agent_a"], {}, "Agent A should start with empty notebook");

    // Agent B receives Agent A's notebook merged into globalNotebook.
    assert.equal(receivedSnapshots["agent_b"]["jd_price"], "5000", "Agent B should see jd_price from Agent A");
    assert.equal(receivedSnapshots["agent_b"]["product_name"], "MacBook Pro", "Agent B should see product_name from Agent A");

    // Agent B should NOT have its own key in the incoming snapshot (that's A's data only).
    assert.equal(receivedSnapshots["agent_b"]["comparison_done"], undefined, "Agent B should not see its own output as input");
  });

  it("should merge notebooks from multiple parallel predecessors", async () => {
    const receivedSnapshots: Record<string, Record<string, any>> = {};

    await runTaskGraph({
      goal: "多平台比价汇总",
      tasks: [
        { id: "jd", title: "查询京东", description: "获取京东价格" },
        { id: "tmall", title: "查询淘宝", description: "获取淘宝价格" },
        { id: "summary", title: "汇总报告", description: "对比价格", dependsOn: ["jd", "tmall"] },
      ],
      executeSubtask: async (node, _dag, notebookSnapshot) => {
        receivedSnapshots[node.id] = { ...notebookSnapshot };

        const notebooks: Record<string, Record<string, any>> = {
          jd: { jd_price: "4999", jd_availability: "有货" },
          tmall: { tmall_price: "5100", tmall_availability: "有货" },
          summary: {},
        };

        return {
          success: true,
          finalState: {
            status: "FINISHED",
            long_term_memory: { summary: "", notebook: notebooks[node.id] },
            total_history: [{ step: 1, action: { type: "finish", description: "Done" }, result: null, step_summary: "Done" }],
          },
        };
      },
      onRoundStart: () => {},
      maxParallelSubAgents: 2,
    });

    // Both jd and tmall start empty.
    assert.deepEqual(receivedSnapshots["jd"], {});
    assert.deepEqual(receivedSnapshots["tmall"], {});

    // Summary receives the merged notebook from both predecessors.
    assert.equal(receivedSnapshots["summary"]["jd_price"], "4999");
    assert.equal(receivedSnapshots["summary"]["tmall_price"], "5100");
    assert.equal(receivedSnapshots["summary"]["jd_availability"], "有货");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Full-stack — LLM prompt injection verification
// Verifies that Agent B's planner prompt actually contains data memorized by Agent A.
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Notebook Handoff — Full Agent Stack", () => {
  it("should inject Agent A memorize output into Agent B planner prompt", async () => {
    // Install a fake page driver so the planner doesn't crash trying to read a real tab.
    const fakeDriver = {
      init: async (_tabId: number) => {},
      getSemanticDOM: async () => "[Fake DOM: Price comparison page]",
      click: async () => true,
      type: async () => true,
      scroll: async () => true,
      press: async () => true,
    };
    setPageDriver(fakeDriver as any);

    // Mock cdpClient to avoid any real browser connections.
    const { cdpClient } = await import("../../../src/drivers/cdp");
    const originalAttach = cdpClient.attach;
    const originalDetach = cdpClient.detach;
    cdpClient.attach = async () => {};
    cdpClient.detach = async () => {};

    // Track which call we're on and capture Agent B's planner messages.
    let plannerCallIndex = 0;
    let agentBPlannerPrompt = "";

    // Responses in order of planner calls:
    //   [0] Agent A, call 1 → memorize jd_price
    //   [1] Agent A, call 2 → finish
    //   [2] Agent B, call 1 → finish (we also capture the prompt here)
    const plannerResponses = [
      JSON.stringify({
        type: "memorize",
        params: { key: "jd_price", value: "5000" },
        task_list: [{ id: "1", goal: "获取京东价格", status: "进行中" }],
        description: "将京东价格写入 Notebook",
      }),
      JSON.stringify({
        type: "finish",
        result: "已将京东价格 5000 写入 Notebook",
        task_list: [{ id: "1", goal: "获取京东价格", status: "已完成" }],
        description: "任务完成",
      }),
      JSON.stringify({
        type: "finish",
        result: "京东价格为 5000 元，已完成比价汇总",
        task_list: [{ id: "1", goal: "汇总比价报告", status: "已完成" }],
        description: "任务完成",
      }),
    ];

    globalThis.__MOCK_STREAM_LLM__ = async (messages: any[], node: string, _modelName: string) => {
      if (node !== "planner") {
        throw new Error(`[Test] Unexpected LLM call for node: "${node}". Only planner calls are expected in this test.`);
      }

      const idx = plannerCallIndex++;

      if (idx === 2) {
        // This is Agent B's planner call — capture the full prompt for assertion.
        agentBPlannerPrompt = messages.map((m: any) => {
          const content = m.content ?? m.lc_kwargs?.content ?? "";
          if (typeof content === "string") return content;
          if (Array.isArray(content)) return content.map((c: any) => c.text ?? "").join("");
          return "";
        }).join("\n");
      }

      const response = plannerResponses[idx] ?? plannerResponses[plannerResponses.length - 1];
      return { content: response, tokenUsage: { prompt: 10, completion: 10, total: 20 } };
    };
    globalThis.__MOCK_INVOKE_LLM__ = globalThis.__MOCK_STREAM_LLM__;

    let dagResult: any = null;
    let dagError: Error | null = null;

    const activeAgents = new Map<number, ClawAgent>();
    const config: AgentConfig = {
      tabId: 999,
      goal: "比较京东商品价格并汇总",
      subtasks: [
        { id: "jd_agent", title: "查询京东价格", description: "访问京东，找到商品价格并用 memorize 写入 Notebook", dependsOn: [] },
        { id: "summary_agent", title: "汇总比价报告", description: "读取 Notebook 中的价格数据，输出比价结论", dependsOn: ["jd_agent"] },
      ],
      onFinish: (result) => { dagResult = result; },
      onError: (err) => { dagError = err instanceof Error ? err : new Error(String(err)); },
      // No memory provider — avoid LLM calls for experience extraction.
      memory: undefined,
    };

    try {
      await runWithDependencyScheduler(config, activeAgents);

      // Both agents should have succeeded.
      assert.ifError(dagError);
      assert.ok(dagResult, "DAG should have produced a result");

      // The captured Agent B prompt must contain the memorized data from Agent A.
      assert.ok(
        agentBPlannerPrompt.length > 0,
        "Agent B planner should have been called (prompt was not captured)",
      );
      assert.ok(
        agentBPlannerPrompt.includes("jd_price"),
        `Agent B planner prompt should contain 'jd_price' from Agent A's notebook.\n` +
        `Captured prompt excerpt: ...${agentBPlannerPrompt.slice(agentBPlannerPrompt.indexOf("Notebook") - 10, agentBPlannerPrompt.indexOf("Notebook") + 300)}...`,
      );
      assert.ok(
        agentBPlannerPrompt.includes("5000"),
        "Agent B planner prompt should contain the memorized value '5000'",
      );
      assert.ok(
        agentBPlannerPrompt.includes("Extracted Data") || agentBPlannerPrompt.includes("Notebook"),
        "Agent B planner prompt should contain the Notebook section header",
      );
    } finally {
      globalThis.__MOCK_STREAM_LLM__ = undefined;
      globalThis.__MOCK_INVOKE_LLM__ = undefined;
      cdpClient.attach = originalAttach;
      cdpClient.detach = originalDetach;
    }
  });
});
