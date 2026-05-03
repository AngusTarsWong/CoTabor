import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = "http://127.0.0.1:6789";
  process.env.HTTP_PROXY = "http://127.0.0.1:6789";
}

import { withTestRunner } from "../runners/base-runner";
import { runSubAgentTask } from "../../../src/core/orchestrator/runtime/SubAgentRunner";
import { extractTaskGraphSummary, runTaskGraph } from "../../../src/core/orchestrator/runtime/TaskGraphRunner";

const today = new Date().toISOString().slice(0, 10);

describe("Live E2E: Scheduler Integration", { timeout: 120000 }, () => {
  it("should successfully fan-in two echo tasks to a notion_operator task", async () => {
    await withTestRunner("scheduler-integration", async (runner, runtime) => {
      runner.logEvent("info", "Starting Scheduler Integration Test (echo + notion_operator)");

      const tasks = [
        {
          id: "draft_intro",
          title: "起草文章标题与引言",
          description: `调用 echo 技能：\n标题：多智能体协作-并行与依赖调度的实践（${today}）\n引言：多智能体系统通过将复杂任务拆解为可并行执行的子任务，显著提升了自动化流程的效率与可靠性。\n输出 finish。`,
          dependsOn: [], maxAttempts: 2,
        },
        {
          id: "draft_body",
          title: "起草文章正文",
          description: "调用 echo 技能：\n正文：调度器基于有向无环图（DAG）管理子任务依赖关系。无依赖的任务并行启动...\n输出 finish。",
          dependsOn: [], maxAttempts: 2,
        },
        {
          id: "publish_to_notion",
          title: "将文章发布到 Notion",
          description: `调用 notion_operator 技能，创建一个新页面：\n- 页面标题：多智能体协作-并行与依赖调度的实践（${today}）\n- operate_type: create_page`,
          dependsOn: ["draft_intro", "draft_body"], maxAttempts: 2,
        },
      ];

      const result = await runTaskGraph({
        goal: "scheduler integration",
        tasks,
        maxParallelSubAgents: 2,
        executeSubtask: async (node, dag) => {
          const subtaskResult = await runSubAgentTask(
            node,
            (node) => ({ tabId: runtime.tabId, goal: node.description ?? node.title }),
            dag,
          );
          const summary = extractTaskGraphSummary(subtaskResult.finalState, subtaskResult.error?.message);
          runner.logEvent("subtask_result", `[${node.id}] ${subtaskResult.success ? "✅" : "❌"} ${summary}`);
          return { success: subtaskResult.success, finalState: subtaskResult.finalState, summary };
        },
      });

      const state = result.schedulerRuntime;
      runner.logEvent("dag", `completed: [${state.completed.join(", ")}], failed: [${state.failed.join(", ")}], blocked: [${state.blocked.join(", ")}]`);

      assert.equal(state.failed.length, 0, "Failed nodes list should be empty");
      assert.equal(state.blocked.length, 0, "Blocked nodes list should be empty");
      assert.ok(state.completed.includes("publish_to_notion"), "Publish task should be completed");
    }, { headless: true });
  });
});
