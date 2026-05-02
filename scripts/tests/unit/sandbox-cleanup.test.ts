
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { closeSandboxPageSafely, isIgnorableSandboxCloseError } from "../../../src/runner/sandbox-cleanup.js";

describe("sandbox-cleanup", () => {
  it("ignores Protocol-error session-closed page errors on close", async () => {
    const page = {
      isClosed: () => false,
      close: async () => {
        throw new Error(
          "Protocol error (Runtime.evaluate): Session closed. Most likely the page has been closed.",
        );
      },
    } as any;
    // Should not throw
    await closeSandboxPageSafely(page);
  });

  it("classifies connection-closed as ignorable", () => {
    assert.equal(isIgnorableSandboxCloseError(new Error("Connection closed.")), true);
  });

  it("classifies session-closed as ignorable", () => {
    assert.equal(
      isIgnorableSandboxCloseError(new Error("Session closed.")),
      true,
    );
  });

  it("does not classify generic errors as ignorable", () => {
    assert.equal(isIgnorableSandboxCloseError(new Error("Network error")), false);
  });

  it("skips already-closed pages without calling close()", async () => {
    let closeCalled = false;
    const page = {
      isClosed: () => true,
      close: async () => { closeCalled = true; },
    } as any;
    await closeSandboxPageSafely(page);
    assert.equal(closeCalled, false);
  });
});
