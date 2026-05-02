
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRetryDecision } from "../../../src/core/orchestrator/runtime/RetryPolicy.js";

describe("RetryPolicy", () => {
  it("non-retryable error returns no retry", () => {
    const result = computeRetryDecision(1, 3, false);
    assert.equal(result.shouldRetry, false);
  });

  it("retryable error within limit returns retry with delay", () => {
    const result = computeRetryDecision(1, 3, true, 100, 5000);
    assert.equal(result.shouldRetry, true);
    assert.ok(result.delayMs >= 100);
  });

  it("retryable error at max attempts returns no retry", () => {
    const result = computeRetryDecision(3, 3, true);
    assert.equal(result.shouldRetry, false);
  });

  it("delay is capped at maxDelayMs", () => {
    const result = computeRetryDecision(1, 10, true, 1000, 2000);
    assert.ok(result.delayMs <= 2000);
  });

  it("delay grows with each attempt (exponential backoff)", () => {
    const first = computeRetryDecision(1, 10, true, 100, 60000);
    const second = computeRetryDecision(2, 10, true, 100, 60000);
    assert.ok(second.delayMs >= first.delayMs);
  });
});
