
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSharedTabPolicy } from "../../../src/core/orchestrator/runtime/TaskGraphPolicy.js";

describe("resolveSharedTabPolicy", () => {
  it("page-sensitive shared-tab DAG is downgraded to serial mode", () => {
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

  it("parallel page-sensitive shared-tab DAG is rejected", () => {
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

  it("isolated_tabs mode preserves requested parallelism", () => {
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

  it("external_io tasks can always run in parallel on shared_tab", () => {
    const result = resolveSharedTabPolicy({
      tasks: [
        { id: "a", title: "A", resourceProfile: "external_io" },
        { id: "b", title: "B", resourceProfile: "external_io" },
      ],
      requestedMaxParallelSubAgents: 4,
    });
    assert.ok(result.effectiveMaxParallelSubAgents >= 2);
    assert.equal(result.warnings.length, 0);
  });
});
