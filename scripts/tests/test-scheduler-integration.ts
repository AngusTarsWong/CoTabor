/**
 * Integration test for the multi-agent dependency scheduler.
 *
 * DAG shape (no external network required):
 *   draft_intro  ──┐
 *                  ├──► publish_to_notion
 *   draft_body   ──┘
 *
 * - draft_intro / draft_body: parallel, use `echo` skill to produce content
 * - publish_to_notion: fan-in, uses `notion_operator` to write both drafts into a Notion page
 *
 * Run: npm run test:scheduler-integration
 */
import "dotenv/config";
import "fake-indexeddb/auto";

// Notion API needs proxy in CN environment
if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = "http://127.0.0.1:6789";
  process.env.HTTP_PROXY = "http://127.0.0.1:6789";
}

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { buildSubtaskDag } from "../../src/core/orchestrator/planning/DependencyExtractor";
import { validateSubtaskDag } from "../../src/core/orchestrator/planning/DagValidator";
import { DependencyScheduler } from "../../src/core/orchestrator/scheduler/DependencyScheduler";
import { nextLaunchBatch } from "../../src/core/orchestrator/scheduler/ReadyQueue";
import { runSubAgentTask } from "../../src/core/orchestrator/runtime/SubAgentRunner";
import type { SubtaskNode } from "../../src/core/orchestrator/types/SubtaskDag";

const today = new Date().toISOString().slice(0, 10);

async function main() {
  console.log("\n=== Scheduler Integration Test (echo + notion_operator) ===\n");

  const runtime = await bootstrapNode();
  const baseConfig = {
    tabId: runtime.tabId,
    onLog: (msg: string) => {
      // only print planner decisions to keep output readable
      if (msg.includes("[planner]") || msg.includes("finish") || msg.includes("call_skill")) {
        console.log(`  [log] ${msg}`);
      }
    },
  };

  // Build DAG
  const dag = buildSubtaskDag({
    tasks: [
      {
        id: "draft_intro",
        title: "起草文章标题与引言",
        description: `你的任务是起草一篇关于多智能体协作的文章的标题和引言段落。\n请直接调用 echo 技能，将以下内容作为 text 参数传入：\n标题：多智能体协作-并行与依赖调度的实践（${today}）\n引言：多智能体系统通过将复杂任务拆解为可并行执行的子任务，显著提升了自动化流程的效率与可靠性。\n调用 echo 后，输出 finish，在 description 中填写你 echo 回来的内容。`,
        dependsOn: [],
        maxAttempts: 2,
      },
      {
        id: "draft_body",
        title: "起草文章正文",
        description: "你的任务是起草一篇关于多智能体协作的文章的正文段落。\n请直接调用 echo 技能，将以下内容作为 text 参数传入：\n正文：调度器基于有向无环图（DAG）管理子任务依赖关系。无依赖的任务并行启动，有依赖的任务在所有前置任务成功后才进入就绪队列。失败的任务会阻断其所有后继节点，确保数据一致性。\n调用 echo 后，输出 finish，在 description 中填写你 echo 回来的内容。",
        dependsOn: [],
        maxAttempts: 2,
      },
      {
        id: "publish_to_notion",
        title: "将文章发布到 Notion",
        description: `你的任务是将前两个子任务生成的文章内容发布到 Notion。\n请调用 notion_operator 技能，创建一个新页面，要求如下：\n- 页面标题：多智能体协作-并行与依赖调度的实践（${today}）\n- 页面内容：将前置任务输出摘要中的标题、引言和正文内容整合为完整文章，写入页面正文。\n- operate_type 参数填写：create_page\n调用成功后，输出 finish，在 description 中填写 Notion 页面创建结果。`,
        dependsOn: ["draft_intro", "draft_body"],
        maxAttempts: 2,
      },
    ],
  });

  const validation = validateSubtaskDag(dag);
  if (!validation.valid) {
    console.error("[FAIL] DAG validation failed:", validation.errors);
    await runtime.cleanup();
    process.exit(1);
  }
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;
  dag.hasCycle = false;
  console.log(`[dag] roots=[${dag.roots}]  order=[${dag.topoOrder}]\n`);

  const scheduler = new DependencyScheduler(dag, `integration_${Date.now()}`);
  const maxParallel = 2;

  let round = 0;
  while (true) {
    const launchIds = nextLaunchBatch(scheduler, maxParallel);
    if (launchIds.length === 0) {
      if (scheduler.isDone()) break;
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }

    round++;
    console.log(`[round ${round}] launching: [${launchIds.join(", ")}]`);

    await Promise.all(
      launchIds.map(async (id) => {
        const node = scheduler.getDag().nodes[id];
        if (!node) return;

        const result = await runSubAgentTask(
          node,
          (_n: SubtaskNode) => ({ ...baseConfig, subtasks: undefined }),
          scheduler.getDag(),
        );

        const icon = result.success ? "✅" : "❌";
        const summary = result.finalState?.planner_output?.action?.description ?? result.error?.message ?? "";
        console.log(`  ${icon} [${id}] ${summary.slice(0, 120)}`);

        scheduler.markResult({
          id,
          success: result.success,
          outputRef: result.success
            ? { id: `out_${id}`, summary, createdAt: Date.now() }
            : undefined,
          error: result.success
            ? undefined
            : { code: "sub_agent_failed", message: result.error?.message ?? "failed", retryable: true },
        });
      }),
    );

    if (scheduler.isDone()) break;
  }

  const state = scheduler.getState();
  console.log("\n=== Final State ===");
  console.log(`  completed : [${state.completed.join(", ")}]`);
  console.log(`  failed    : [${state.failed.join(", ")}]`);
  console.log(`  blocked   : [${state.blocked.join(", ")}]`);

  const ok = state.failed.length === 0 && state.blocked.length === 0;
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — scheduler integration test`);

  await runtime.cleanup();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
