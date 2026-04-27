import assert from "node:assert/strict";
import { buildSubtaskDag } from "../../src/core/orchestrator/planning/DependencyExtractor";
import { validateSubtaskDag } from "../../src/core/orchestrator/planning/DagValidator";
import { DependencyScheduler } from "../../src/core/orchestrator/scheduler/DependencyScheduler";
import { computeRetryDecision } from "../../src/core/orchestrator/runtime/RetryPolicy";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

// ─── DagValidator ────────────────────────────────────────────────────────────

console.log("\n[DagValidator]");

test("valid linear chain passes", () => {
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

test("valid parallel tasks pass", () => {
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

test("cycle is detected", () => {
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

test("self-dependency is rejected", () => {
  const dag = buildSubtaskDag({
    tasks: [{ id: "a", title: "A", dependsOn: ["a"] }],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("itself")));
});

test("missing dependency is rejected", () => {
  const dag = buildSubtaskDag({
    tasks: [{ id: "a", title: "A", dependsOn: ["nonexistent"] }],
  });
  const result = validateSubtaskDag(dag);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("missing")));
});

// ─── DependencyScheduler ─────────────────────────────────────────────────────

console.log("\n[DependencyScheduler]");

test("parallel tasks all start immediately", () => {
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

test("dependent task waits for predecessor", () => {
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

test("mixed DAG: parallel branches then fan-in", () => {
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

test("failed task blocks descendants", () => {
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

test("retryable failure re-queues task", () => {
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

test("non-retryable error returns no retry", () => {
  const result = computeRetryDecision(1, 3, false);
  assert.equal(result.shouldRetry, false);
});

test("retryable error within limit returns retry with delay", () => {
  const result = computeRetryDecision(1, 3, true, 100, 5000);
  assert.equal(result.shouldRetry, true);
  assert.ok(result.delayMs >= 100);
});

test("retryable error at max attempts returns no retry", () => {
  const result = computeRetryDecision(3, 3, true);
  assert.equal(result.shouldRetry, false);
});

test("delay is capped at maxDelayMs", () => {
  const result = computeRetryDecision(1, 10, true, 1000, 2000);
  assert.ok(result.delayMs <= 2000);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
