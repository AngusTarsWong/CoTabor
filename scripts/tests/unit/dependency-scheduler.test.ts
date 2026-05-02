
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSubtaskDag } from "../../../src/core/orchestrator/planning/DependencyExtractor.js";
import { validateSubtaskDag } from "../../../src/core/orchestrator/planning/DagValidator.js";
import { DependencyScheduler } from "../../../src/core/orchestrator/scheduler/DependencyScheduler.js";

/** Build a validated DAG and return it with roots/topoOrder populated. */
function buildValidDag(tasks: Parameters<typeof buildSubtaskDag>[0]["tasks"]) {
  const dag = buildSubtaskDag({ tasks });
  const v = validateSubtaskDag(dag);
  dag.roots = v.roots;
  dag.topoOrder = v.topoOrder;
  return dag;
}

describe("DependencyScheduler", () => {
  it("parallel tasks all start immediately", () => {
    const dag = buildValidDag([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ]);
    const scheduler = new DependencyScheduler(dag, "run_parallel");
    const decision = scheduler.decide(5);
    assert.equal(decision.launch.length, 3);
  });

  it("dependent task waits for predecessor", () => {
    const dag = buildValidDag([
      { id: "a", title: "A" },
      { id: "b", title: "B", dependsOn: ["a"] },
    ]);
    const scheduler = new DependencyScheduler(dag, "run_chain");
    assert.deepEqual(scheduler.decide(5).launch, ["a"]);

    scheduler.markResult({ id: "a", success: true });
    assert.deepEqual(scheduler.decide(5).launch, ["b"]);
  });

  it("mixed DAG: parallel branches then fan-in", () => {
    const dag = buildValidDag([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C", dependsOn: ["a", "b"] },
    ]);
    const scheduler = new DependencyScheduler(dag, "run_mixed");

    const first = scheduler.decide(5);
    assert.equal(first.launch.length, 2);
    assert.ok(first.launch.includes("a") && first.launch.includes("b"));

    scheduler.markResult({ id: "a", success: true });
    assert.equal(scheduler.decide(5).launch.length, 0); // b still running

    scheduler.markResult({ id: "b", success: true });
    assert.deepEqual(scheduler.decide(5).launch, ["c"]);
  });

  it("failed task blocks all descendants", () => {
    const dag = buildValidDag([
      { id: "a", title: "A", maxAttempts: 1 },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "c", title: "C", dependsOn: ["b"] },
    ]);
    const scheduler = new DependencyScheduler(dag, "run_fail");
    scheduler.decide(5);
    scheduler.markResult({ id: "a", success: false, error: { code: "err", message: "fail", retryable: false } });

    const state = scheduler.getState();
    assert.ok(state.failed.includes("a"));
    assert.ok(state.blocked.includes("b"));
    assert.ok(state.blocked.includes("c"));
    assert.equal(scheduler.isDone(), true);
  });

  it("retryable failure re-queues task within attempt limit", () => {
    const dag = buildValidDag([{ id: "a", title: "A", maxAttempts: 3 }]);
    const scheduler = new DependencyScheduler(dag, "run_retry");
    scheduler.decide(5);
    scheduler.markResult({ id: "a", success: false, error: { code: "timeout", message: "timeout", retryable: true } });

    const state = scheduler.getState();
    assert.equal(state.readyQueue.includes("a"), true);
    assert.equal(state.failed.includes("a"), false);
  });

  it("max parallelism cap limits simultaneous launches", () => {
    const dag = buildValidDag([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ]);
    const scheduler = new DependencyScheduler(dag, "run_capped");
    const decision = scheduler.decide(2); // cap at 2
    assert.equal(decision.launch.length, 2);
  });
});
