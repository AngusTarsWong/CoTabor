/**
 * Integration test for the multi-agent dependency scheduler.
 * Uses Wikipedia MCP (no browser required) to run two parallel sub-tasks
 * followed by a fan-in aggregation task, exercising the full DAG scheduling path.
 *
 * Run: npm run test:scheduler-integration
 */
import "dotenv/config";
import "fake-indexeddb/auto";

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { loadBuiltInMcpSkills } from "../../src/skills/bundled/mcp-builtin";
import { skillRegistry } from "../../src/skills/registry";
import { buildSubtaskDag } from "../../src/core/orchestrator/planning/DependencyExtractor";
import { validateSubtaskDag } from "../../src/core/orchestrator/planning/DagValidator";
import { DependencyScheduler } from "../../src/core/orchestrator/scheduler/DependencyScheduler";
import { nextLaunchBatch } from "../../src/core/orchestrator/scheduler/ReadyQueue";
import { runSubAgentTask } from "../../src/core/orchestrator/runtime/SubAgentRunner";
import type { SubtaskNode } from "../../src/core/orchestrator/types/SubtaskDag";

async function main() {
  console.log("\n=== Scheduler Integration Test ===\n");

  // 1. Bootstrap runtime + MCP skills
  const runtime = await bootstrapNode();
  const mcpSkills = await loadBuiltInMcpSkills();
  for (const skill of mcpSkills) {
    skillRegistry.register(skill);
  }
  console.log(`[setup] Registered ${mcpSkills.length} MCP skills`);

  // 2. Build a DAG: two parallel research tasks, then one aggregation task
  const dag = buildSubtaskDag({
    tasks: [
      {
        id: "research_usa",
        title: "Research United States",
        description: "Use search_wikipedia and get_wikipedia_summary to get a brief summary of the United States. Output finish with a 1-sentence Chinese summary in description.",
        dependsOn: [],
        maxAttempts: 2,
      },
      {
        id: "research_china",
        title: "Research China",
        description: "Use search_wikipedia and get_wikipedia_summary to get a brief summary of China (People's Republic of China). Output finish with a 1-sentence Chinese summary in description.",
        dependsOn: [],
        maxAttempts: 2,
      },
      {
        id: "compare",
        title: "Compare USA and China",
        description: "Based on the previous research results, write a 2-sentence Chinese comparison of the United States and China. Output finish with the comparison in description.",
        dependsOn: ["research_usa", "research_china"],
        maxAttempts: 1,
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
  console.log(`[dag] Valid. Roots: [${dag.roots}], Order: [${dag.topoOrder}]`);

  // 3. Run the scheduler loop
  const scheduler = new DependencyScheduler(dag, `integration_${Date.now()}`);
  const maxParallel = 2;
  const baseConfig = {
    tabId: runtime.tabId,
    onLog: (msg: string) => console.log(`  [log] ${msg}`),
  };

  let round = 0;
  while (true) {
    const launchIds = nextLaunchBatch(scheduler, maxParallel);
    if (launchIds.length === 0) {
      if (scheduler.isDone()) break;
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }

    round++;
    console.log(`\n[round ${round}] Launching: [${launchIds.join(", ")}]`);

    await Promise.all(
      launchIds.map(async (id) => {
        const node = scheduler.getDag().nodes[id];
        if (!node) return;

        const result = await runSubAgentTask(node, (_n: SubtaskNode) => ({
          ...baseConfig,
          goal: node.description ?? node.title,
          subtasks: undefined,
        }));

        console.log(`  [${id}] ${result.success ? "✅ succeeded" : "❌ failed"}`);
        if (!result.success) console.log(`  [${id}] error: ${result.error?.message}`);

        scheduler.markResult({
          id,
          success: result.success,
          outputRef: result.success
            ? {
                id: `out_${id}`,
                summary: result.finalState?.planner_output?.action?.description ?? "",
                createdAt: Date.now(),
              }
            : undefined,
          error: result.success
            ? undefined
            : { code: "sub_agent_failed", message: result.error?.message ?? "failed", retryable: true },
        });
      })
    );

    if (scheduler.isDone()) break;
  }

  // 4. Report results
  const state = scheduler.getState();
  console.log("\n=== Final State ===");
  console.log(`  completed: [${state.completed.join(", ")}]`);
  console.log(`  failed:    [${state.failed.join(", ")}]`);
  console.log(`  blocked:   [${state.blocked.join(", ")}]`);

  const allSucceeded = state.failed.length === 0 && state.blocked.length === 0;
  console.log(`\n${allSucceeded ? "✅ PASS" : "❌ FAIL"} — scheduler integration test`);

  await runtime.cleanup();
  process.exit(allSucceeded ? 0 : 1);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
