import "dotenv/config";
import "fake-indexeddb/auto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMMocker } from "../mocks/llm";
import { runSingleAgentOnTab } from "../../../src/core/orchestrator/modes/SingleAgentMode";
import { AgentConfig, ClawAgent } from "../../../src/lib/claw/agent";

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

describe("Architecture: spawn_subagent — Master-Child Agent Pattern", () => {
  it("master outputs spawn_subagent → executor runs sub-agents → master continues with finish", async () => {
    const mocker = new LLMMocker();

    // Step 1: Master planner decides to spawn sub-agents
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "三平台并行搜索阿里巴巴新闻", status: "进行中" }],
        type: "spawn_subagent",
        description: "任务包含多个独立数据源，启动并行子任务。",
        subtasks: [
          { id: "google", title: "Google 搜索", goal: "在 Google 搜索阿里巴巴最新新闻", dependsOn: [] },
          { id: "baidu",  title: "百度搜索",   goal: "在百度搜索阿里巴巴最新新闻",   dependsOn: [] },
          { id: "bing",   title: "Bing 搜索",  goal: "在 Bing 搜索阿里巴巴最新新闻",  dependsOn: [] },
        ],
      }),
    });

    // Step 2: All 3 sub-agents each get 1 memorize then 1 finish (times:3 each)
    mocker.addRule({
      nodeMatch: "planner",
      times: 3,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "完成搜索", status: "已完成" }],
        type: "memorize",
        key: "news_result",
        value: "阿里巴巴Q1营收增长7%",
        description: "记录搜索结果",
      }),
    });
    mocker.addRule({
      nodeMatch: "planner",
      times: 3,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "完成搜索", status: "已完成" }],
        type: "finish",
        result: "搜索完成，找到相关新闻",
        description: "子任务完成",
      }),
    });

    // Step 3: Master planner resumes after sub-agents complete → outputs finish
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "三平台并行搜索阿里巴巴新闻", status: "已完成" }],
        type: "finish",
        result: "综合三平台结果：阿里巴巴Q1营收增长7%，马云出席多个论坛活动。",
        description: "Master 自主合成结论，任务完成。",
      }),
    });

    const { cdpClient } = await import("../../../src/drivers/cdp");
    const originalAttach = cdpClient.attach;
    const originalDetach = cdpClient.detach;
    cdpClient.attach = async () => {};
    cdpClient.detach = async () => {};

    const finishResults: any[] = [];
    const snapshots: any[] = [];
    const logs: string[] = [];

    const config: AgentConfig = {
      tabId: 999,
      goal: "用 Google/百度/Bing 三路搜索阿里巴巴新闻，然后给我一份汇总报告",
      onLog: (msg) => logs.push(msg),
      onFinish: (result) => finishResults.push(result),
      onResourceRuntimeUpdate: (snapshot) => {
        if (snapshot?.agents?.length) snapshots.push(snapshot);
      },
    };

    try {
      const activeAgents = new Map<number, ClawAgent>();
      await runSingleAgentOnTab(config, activeAgents);

      // ── Assertions ──────────────────────────────────────────────────────────

      // 1. Master finished (not failed)
      assert.ok(finishResults.length > 0, "Master agent should have called onFinish");

      // 2. Sub-agent snapshots were emitted (SwarmMasterCard would show 3 bees)
      assert.ok(snapshots.length > 0, "ResourceRuntime snapshots should have been emitted during spawn_subagent");
      const lastSnapshot = snapshots[snapshots.length - 1];
      assert.ok(
        Array.isArray(lastSnapshot.agents) && lastSnapshot.agents.length === 3,
        `Should have 3 sub-agent snapshots, got ${lastSnapshot?.agents?.length}`,
      );

      // 3. Final state has subagent_results with all 3 results + original goals
      const finalState = finishResults[0];
      const results = finalState?.subagent_results ?? {};
      assert.ok("google" in results, "subagent_results should contain google");
      assert.ok("baidu"  in results, "subagent_results should contain baidu");
      assert.ok("bing"   in results, "subagent_results should contain bing");

      assert.strictEqual(results.google.goal, "在 Google 搜索阿里巴巴最新新闻", "google result should carry original goal");
      assert.strictEqual(results.baidu.goal,  "在百度搜索阿里巴巴最新新闻",     "baidu result should carry original goal");

      // 4. Master synthesized the final result itself (no DagResultResolver)
      const finalResult = finalState?.planner_output?.action?.result ?? "";
      assert.ok(finalResult.length > 0, "Master should have a finish result");

      console.log("\n✅ spawn_subagent 架构验证通过：");
      console.log(`  • 子 Agent 快照数: ${snapshots.length}`);
      console.log(`  • 最终子任务结果: ${JSON.stringify(Object.keys(results))}`);
      console.log(`  • Master 合成结论: ${finalResult.slice(0, 80)}...`);
    } finally {
      mocker.destroy();
      cdpClient.attach = originalAttach;
      cdpClient.detach = originalDetach;
    }
  });

  it("sub-agents are blocked from nesting spawn_subagent (swarmMode=true guard)", async () => {
    const mocker = new LLMMocker();

    // Sub-agent tries to spawn further sub-agents — should be blocked and replanned
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: JSON.stringify({
        type: "spawn_subagent",
        subtasks: [{ id: "nested", title: "嵌套", goal: "Nested task", dependsOn: [] }],
      }),
    });

    // After replan, finish normally
    mocker.addRule({
      nodeMatch: "planner",
      response: JSON.stringify({
        type: "finish",
        result: "Completed after replan",
        description: "完成",
      }),
    });

    const { parsePlannerResponse } = await import("../../../src/core/planning/parsePlannerResponse");
    const nestedAction = parsePlannerResponse(
      JSON.stringify({ type: "spawn_subagent", subtasks: [] }),
      [],
      { total_history: [], last_observation: null, task_list: [], meta_data: { swarmMode: true } },
    );

    assert.strictEqual(
      nestedAction.action.type,
      "replan",
      "spawn_subagent inside a sub-agent (swarmMode=true) should be blocked → replan",
    );
    assert.strictEqual(nestedAction.action.reason, "spawn_subagent_disabled");

    mocker.destroy();
    console.log("✅ 子 Agent 嵌套防护验证通过");
  });
});
