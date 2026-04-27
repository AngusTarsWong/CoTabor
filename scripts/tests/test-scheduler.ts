import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { persistDagNodeExecution } from "../../src/memory/task-commit/dag-node-persistence";
import { memoryStore } from "../../src/memory/store/indexeddb";
import { parseAgentLaunchInput } from "../../src/core/orchestrator/launch-request";
import { buildSubtaskDag } from "../../src/core/orchestrator/planning/DependencyExtractor";
import { validateSubtaskDag } from "../../src/core/orchestrator/planning/DagValidator";
import { DependencyScheduler } from "../../src/core/orchestrator/scheduler/DependencyScheduler";
import { computeRetryDecision } from "../../src/core/orchestrator/runtime/RetryPolicy";
import { SandboxTabAllocator } from "../../src/core/orchestrator/runtime/SandboxTabAllocator";
import { resolveSharedTabPolicy } from "../../src/core/orchestrator/runtime/TaskGraphPolicy";
import { runTaskGraph } from "../../src/core/orchestrator/runtime/TaskGraphRunner";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function main() {
// ─── DagValidator ────────────────────────────────────────────────────────────

console.log("\n[DagValidator]");

await test("valid linear chain passes", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "c", title: "C", dependsOn: ["b"] },
    ],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, true);
  assert.deepEqual(result.topoOrder, ["a", "b", "c"]);
  assert.deepEqual(result.roots, ["a"]);
});

await test("valid parallel tasks pass", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C", dependsOn: ["a", "b"] },
    ],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, true);
  assert.equal(result.roots.length, 2);
  assert.equal(result.topoOrder[result.topoOrder.length - 1], "c");
});

await test("cycle is detected", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A", dependsOn: ["b"] },
      { id: "b", title: "B", dependsOn: ["a"] },
    ],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("cycle")));
});

await test("self-dependency is rejected", () => {
  const dag = buildSubtaskDag({
    tasks: [{ id: "a", title: "A", dependsOn: ["a"] }],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("itself")));
});

await test("missing dependency is rejected", () => {
  const dag = buildSubtaskDag({
    tasks: [{ id: "a", title: "A", dependsOn: ["nonexistent"] }],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("missing")));
});

// ─── DependencyScheduler ─────────────────────────────────────────────────────

console.log("\n[DependencyScheduler]");

await test("parallel tasks all start immediately", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ],
  });
  const validation = validateSubtaskDag(dag);
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;

  const scheduler = new DependencyScheduler(dag, "run_parallel");
  const decision = scheduler.decide(5);
  assert.equal(decision.launch.length, 3);
});

await test("dependent task waits for predecessor", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B", dependsOn: ["a"] },
    ],
  });
  const validation = validateSubtaskDag(dag);
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;

  const scheduler = new DependencyScheduler(dag, "run_chain");
  const first = scheduler.decide(5);
  assert.deepEqual(first.launch, ["a"]);

  scheduler.markResult({ id: "a", success: true });
  const second = scheduler.decide(5);
  assert.deepEqual(second.launch, ["b"]);
});

await test("mixed DAG: parallel branches then fan-in", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C", dependsOn: ["a", "b"] },
    ],
  });
  const validation = validateSubtaskDag(dag);
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;

  const scheduler = new DependencyScheduler(dag, "run_mixed");
  const first = scheduler.decide(5);
  assert.equal(first.launch.length, 2);
  assert.ok(first.launch.includes("a") && first.launch.includes("b"));

  scheduler.markResult({ id: "a", success: true });
  const mid = scheduler.decide(5);
  assert.equal(mid.launch.length, 0);

  scheduler.markResult({ id: "b", success: true });
  const last = scheduler.decide(5);
  assert.deepEqual(last.launch, ["c"]);
});

await test("failed task blocks descendants", () => {
  const dag = buildSubtaskDag({
    tasks: [
      { id: "a", title: "A", maxAttempts: 1 },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "c", title: "C", dependsOn: ["b"] },
    ],
  });
  const validation = validateSubtaskDag(dag);
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;

  const scheduler = new DependencyScheduler(dag, "run_fail");
  scheduler.decide(5);
  scheduler.markResult({ id: "a", success: false, error: { code: "err", message: "fail", retryable: false } });

  const state = scheduler.getState();
  assert.ok(state.failed.includes("a"));
  assert.ok(state.blocked.includes("b"));
  assert.ok(state.blocked.includes("c"));
  assert.equal(scheduler.isDone(), true);
});

await test("retryable failure re-queues task", () => {
  const dag = buildSubtaskDag({
    tasks: [{ id: "a", title: "A", maxAttempts: 3 }],
  });
  const validation = validateSubtaskDag(dag);
  dag.roots = validation.roots;
  dag.topoOrder = validation.topoOrder;

  const scheduler = new DependencyScheduler(dag, "run_retry");
  scheduler.decide(5);
  scheduler.markResult({ id: "a", success: false, error: { code: "timeout", message: "timeout", retryable: true } });

  const state = scheduler.getState();
  assert.equal(state.readyQueue.includes("a"), true);
  assert.equal(state.failed.includes("a"), false);
});

// ─── RetryPolicy ─────────────────────────────────────────────────────────────

console.log("\n[RetryPolicy]");

await test("non-retryable error returns no retry", () => {
  const result = computeRetryDecision(1, 3, false);
  assert.equal(result.shouldRetry, false);
});

await test("retryable error within limit returns retry with delay", () => {
  const result = computeRetryDecision(1, 3, true, 100, 5000);
  assert.equal(result.shouldRetry, true);
  assert.ok(result.delayMs >= 100);
});

await test("retryable error at max attempts returns no retry", () => {
  const result = computeRetryDecision(3, 3, true);
  assert.equal(result.shouldRetry, false);
});

await test("delay is capped at maxDelayMs", () => {
  const result = computeRetryDecision(1, 10, true, 1000, 2000);
  assert.ok(result.delayMs <= 2000);
});

// ─── LaunchRequest ───────────────────────────────────────────────────────────

console.log("\n[LaunchRequest]");

await test("plain text request stays in single mode", () => {
  const result = parseAgentLaunchInput("帮我总结一下这个页面");
  assert.equal(result.mode, "single");
  assert.equal(result.goal, "帮我总结一下这个页面");
});

await test("json dag payload is parsed into dag mode", () => {
  const result = parseAgentLaunchInput(JSON.stringify({
    mode: "dag",
    goal: "发布任务",
    subtasks: [
      { id: "a", title: "A" },
      { id: "b", title: "B", dependsOn: ["a"] },
    ],
    maxParallelSubAgents: 3,
    executionMode: "single_page_serial",
  }));
  assert.equal(result.mode, "dag");
  assert.equal(result.goal, "发布任务");
  assert.equal(result.subtasks?.length, 2);
  assert.equal(result.maxParallelSubAgents, 3);
  assert.equal(result.executionMode, "single_page_serial");
});

await test("fenced json dag payload is supported", () => {
  const result = parseAgentLaunchInput("```json\n{\"goal\":\"流程\",\"tasks\":[{\"id\":\"a\",\"title\":\"A\"}]}\n```");
  assert.equal(result.mode, "dag");
  assert.equal(result.subtasks?.[0]?.id, "a");
});

// ─── TaskGraphRunner ─────────────────────────────────────────────────────────

console.log("\n[TaskGraphRunner]");

await test("runner aggregates subtask results and releases fan-in nodes", async () => {
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
              description: predecessorCount > 0 ? `${node.id}:uses_${predecessorCount}` : `${node.id}:ready`,
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
  assert.equal(result.subtaskResults.publish.summary, "publish:uses_2");
});

// ─── TaskGraphPolicy ────────────────────────────────────────────────────────

console.log("\n[TaskGraphPolicy]");

await test("page-sensitive shared-tab dag is downgraded to serial mode", () => {
  const result = resolveSharedTabPolicy({
    tasks: [
      { id: "open_page", title: "Open page", resourceProfile: "page_write" },
      { id: "read_page", title: "Read page", dependsOn: ["open_page"], resourceProfile: "page_read" },
    ],
    requestedMaxParallelSubAgents: 3,
  });

  assert.equal(result.executionMode, "single_page_serial");
  assert.equal(result.effectiveMaxParallelSubAgents, 1);
  assert.equal(result.warnings.length, 1);
});

await test("parallel page-sensitive shared-tab dag is rejected", () => {
  assert.throws(() => {
    resolveSharedTabPolicy({
      tasks: [
        { id: "a", title: "A", resourceProfile: "page_write" },
        { id: "b", title: "B", resourceProfile: "page_read" },
      ],
      requestedMaxParallelSubAgents: 2,
    });
  }, /Shared-tab DAG cannot run page-sensitive tasks in parallel/);
});

await test("isolated_tabs mode preserves requested parallelism", () => {
  const result = resolveSharedTabPolicy({
    tasks: [
      { id: "a", title: "A", resourceProfile: "page_write" },
      { id: "b", title: "B", resourceProfile: "page_read" },
    ],
    requestedExecutionMode: "isolated_tabs",
    requestedMaxParallelSubAgents: 3,
  });

  assert.equal(result.executionMode, "isolated_tabs");
  assert.equal(result.effectiveMaxParallelSubAgents, 3);
});

// ─── SandboxTabAllocator ────────────────────────────────────────────────────

console.log("\n[SandboxTabAllocator]");

await test("allocator creates group once and assigns tabs per node", async () => {
  const calls: string[] = [];
  let nextTabId = 200;
  const allocator = new SandboxTabAllocator({
    taskName: "parallel page run",
    sourceTabId: 101,
    driver: {
      createGroup: async (title) => {
        calls.push(`createGroup:${title}`);
        return 88;
      },
      destroyGroup: async (groupId) => {
        calls.push(`destroyGroup:${groupId}`);
      },
      openTabInGroup: async (url, groupId) => {
        calls.push(`openTab:${groupId}:${url}`);
        nextTabId += 1;
        return nextTabId;
      },
      highlightTab: async (tabId) => {
        calls.push(`highlight:${tabId}`);
      },
      getTabUrl: async (tabId) => {
        calls.push(`getTabUrl:${tabId}`);
        return "https://source.example/article";
      },
    },
  });

  const first = await allocator.allocate({
    id: "draft",
    title: "Draft",
    dependsOn: [],
    status: "pending",
    attempt: 0,
    maxAttempts: 1,
    metadata: {},
  });
  const second = await allocator.allocate({
    id: "publish",
    title: "Publish",
    dependsOn: ["draft"],
    status: "pending",
    attempt: 0,
    maxAttempts: 1,
    metadata: { targetUrl: "https://target.example/publish" },
  });

  assert.equal(first.url, "https://source.example/article");
  assert.equal(second.url, "https://target.example/publish");
  assert.equal(allocator.getSnapshot().assignments.length, 2);

  await allocator.highlight("publish");
  await allocator.destroy();

  assert.deepEqual(calls, [
    "getTabUrl:101",
    "createGroup:🤖 DAG: parallel page run",
    "openTab:88:https://source.example/article",
    "openTab:88:https://target.example/publish",
    `highlight:${second.tabId}`,
    "destroyGroup:88",
  ]);
});

// ─── Dag Node Persistence ───────────────────────────────────────────────────

console.log("\n[DagNodePersistence]");

await test("persisted dag node records carry dag metadata and skip experience queue", async () => {
  await (memoryStore as any)._clearAll();

  const result = await persistDagNodeExecution({
    dagRunId: "dag_test_001",
    executionMode: "isolated_tabs",
    node: {
      id: "publish",
      title: "Publish article",
      dependsOn: ["draft_intro", "draft_body"],
      status: "succeeded",
      attempt: 1,
      maxAttempts: 2,
      metadata: { resourceProfile: "external_io" },
    },
    success: true,
    sandboxGroupId: 301,
    sandboxTabId: 901,
    summary: "published",
    finalState: {
      task_run_id: "run_publish_001",
      request: "publish article",
      status: "FINISHED",
      meta_data: {
        url: "https://www.notion.so/example",
        title: "Example",
      },
      total_history: [
        {
          step: 1,
          ts: 1000,
          node: "planner",
          action: { type: "call_skill", skill_name: "notion_operator" },
          result: { success: true, message: "planned" },
          step_summary: "planner summary",
          meta: { url: "https://www.notion.so/example", title: "Example" },
        },
        {
          step: 2,
          ts: 2000,
          node: "executor",
          action: { type: "call_skill", skill_name: "notion_operator" },
          result: { success: true, message: "created" },
          step_summary: "executor summary",
          meta: { url: "https://www.notion.so/example", title: "Example" },
        },
      ],
    },
  });

  assert.equal(result.taskRunId, "run_publish_001");
  assert.equal(result.traceCount, 2);

  const taskRuns = await memoryStore.getTaskRunsByDagRun("dag_test_001");
  assert.equal(taskRuns.length, 1);
  assert.equal(taskRuns[0].dagNodeId, "publish");
  assert.equal(taskRuns[0].sandboxTabId, 901);
  assert.equal(taskRuns[0].experienceStatus, "SKIPPED");

  const pendingExperience = await memoryStore.getPendingExperienceTaskRuns();
  assert.equal(pendingExperience.length, 0);

  const rawTraces = await memoryStore.getRawTracesByDagRun("dag_test_001");
  assert.equal(rawTraces.length, 2);
  assert.equal(rawTraces[0].dagNodeId, "publish");
  assert.equal(rawTraces[0].dagExecutionMode, "isolated_tabs");
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
