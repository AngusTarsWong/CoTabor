
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { shouldStopObservedSubAgent } from "../../../src/core/orchestrator/runtime/SubAgentRunner.js";
import { finalizeStoppedState, shouldFinalizeStopAfterChunk } from "../../../src/lib/claw/stop-finalizer.js";
import { clearAgentStopRequest, requestAgentStop } from "../../../src/lib/claw/stop-signal-registry.js";
import { shouldStopAtNodeEntry } from "../../../src/core/graph/nodes/stop.js";

describe("SubAgent stop observer", () => {
  it("stops sub-agent after inactivity timeout", () => {
    const now = Date.now();
    const decision = shouldStopObservedSubAgent(
      {
        nodeId: "a",
        status: "running",
        startedAt: now - 10_000,
        updatedAt: now - 10_000,
        lastProgressAt: now - 60_000,
        replanCount: 0,
        retryCount: 0,
      },
      now,
      { inactivityTimeoutMs: 30_000, maxRuntimeMs: 120_000 },
    );
    assert.equal(decision.shouldStop, true);
    assert.ok(decision.reason?.includes("无进展"));
  });

  it("does not stop active sub-agent within inactivity window", () => {
    const now = Date.now();
    const decision = shouldStopObservedSubAgent(
      {
        nodeId: "b",
        status: "running",
        startedAt: now - 5_000,
        updatedAt: now - 1_000,
        lastProgressAt: now - 1_000,
        replanCount: 0,
        retryCount: 0,
      },
      now,
      { inactivityTimeoutMs: 30_000, maxRuntimeMs: 120_000 },
    );
    assert.equal(decision.shouldStop, false);
  });

  it("stops sub-agent when max runtime is exceeded", () => {
    const now = Date.now();
    const decision = shouldStopObservedSubAgent(
      {
        nodeId: "c",
        status: "running",
        startedAt: now - 200_000,
        updatedAt: now - 1_000,
        lastProgressAt: now - 1_000,
        replanCount: 0,
        retryCount: 0,
      },
      now,
      { inactivityTimeoutMs: 30_000, maxRuntimeMs: 120_000 },
    );
    assert.equal(decision.shouldStop, true);
  });
});

describe("StopFinalizer", () => {
  it("normalizes STOPPING state to STOPPED", () => {
    assert.equal(shouldFinalizeStopAfterChunk({ status: "STOPPING" }), true);
    const finalState = finalizeStoppedState({
      status: "STOPPING",
      stop_requested: true,
      stop_reason: null,
      stop_requested_at: null,
      error: "should clear",
    });
    assert.equal(finalState.status, "STOPPED");
    assert.equal(finalState.error, null);
    assert.equal(finalState.stop_requested, true);
  });

  it("does not finalize RUNNING state", () => {
    assert.equal(shouldFinalizeStopAfterChunk({ status: "RUNNING" }), false);
  });
});

describe("shouldStopAtNodeEntry — thread stop registry", () => {
  const THREAD_ID = "test_stop_registry_thread";

  afterEach(() => {
    clearAgentStopRequest(THREAD_ID);
  });

  it("stops when thread id is in stop registry", () => {
    requestAgentStop(THREAD_ID);
    assert.equal(
      shouldStopAtNodeEntry({
        meta_data: { agent_thread_id: THREAD_ID },
        stop_requested: false,
        status: "RUNNING",
      } as any),
      true,
    );
  });

  it("does not stop when thread id is absent from registry", () => {
    assert.equal(
      shouldStopAtNodeEntry({
        meta_data: { agent_thread_id: THREAD_ID },
        stop_requested: false,
        status: "RUNNING",
      } as any),
      false,
    );
  });

  it("stops when stop_requested flag is set directly on state", () => {
    assert.equal(
      shouldStopAtNodeEntry({
        meta_data: {},
        stop_requested: true,
        status: "RUNNING",
      } as any),
      true,
    );
  });
});
