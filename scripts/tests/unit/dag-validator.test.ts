
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSubtaskDag } from "../../../src/core/orchestrator/planning/DependencyExtractor.js";
import { validateSubtaskDag } from "../../../src/core/orchestrator/planning/DagValidator.js";

describe("DagValidator", () => {
  it("valid linear chain passes", () => {
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

  it("valid parallel tasks pass", () => {
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

  it("cycle is detected", () => {
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

  it("self-dependency is rejected", () => {
    const dag = buildSubtaskDag({
      tasks: [{ id: "a", title: "A", dependsOn: ["a"] }],
    });
    const result = validateSubtaskDag(dag);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("itself")));
  });

  it("missing dependency is rejected", () => {
    const dag = buildSubtaskDag({
      tasks: [{ id: "a", title: "A", dependsOn: ["nonexistent"] }],
    });
    const result = validateSubtaskDag(dag);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing")));
  });
});
