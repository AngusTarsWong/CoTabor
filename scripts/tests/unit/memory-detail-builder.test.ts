import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildExecutorNodeMemoryDetails,
  buildPlannerNodeMemoryDetails,
} from "../../../src/memory/retrieval/memory-detail-builder.ts";
import type { RetrievedMemoriesPayload } from "../../../src/memory/retrieval/retrieve-and-assemble-memories.ts";
import type { MemoryItem } from "../../../src/shared/types/memory.ts";

const now = Date.now();

function makeL1(): MemoryItem {
  return {
    id: "l1",
    type: "L1_HINT",
    title: "Submit button hint",
    content: "click submit",
    tags: ["domain:example.com"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      domain: "example.com",
      pathPattern: "/docs",
      elementSelector: "#submit",
      actionType: "click",
      executionCount: 3,
      successCount: 2,
      physicalInstruction: "click submit",
    },
  };
}

function makeL2(): MemoryItem {
  return {
    id: "l2",
    type: "L2_RULE",
    title: "Notion create page rule",
    content: "always include parent page id",
    tags: ["skill:notion_operator"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      skillName: "notion_operator",
      ruleScope: "base",
      parameterRules: "always include parent page id",
      status: "active",
    },
  };
}

function makeL3(input: { id: string; memoryType?: "positive" | "anti_pattern" }): MemoryItem {
  return {
    id: input.id,
    type: "L3_WORKFLOW",
    title: input.memoryType === "anti_pattern" ? "Avoid premature submit" : "Publish SOP",
    content: "open editor first",
    tags: ["taskType:publish"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      intentQuery: "publish article",
      taskType: "publish",
      tacticalRules: input.memoryType === "anti_pattern" ? "do not submit before preview" : "open editor first",
      memoryType: input.memoryType ?? "positive",
    },
  };
}

function makeRetrievedMemories(): RetrievedMemoriesPayload {
  return {
    plannerContext: "",
    replannerContext: "",
    executorL1Hints: ["click submit"],
    l1Items: [makeL1()],
    l2Items: [makeL2()],
    l3Items: [makeL3({ id: "l3" })],
    antiPatternL3Items: [makeL3({ id: "anti", memoryType: "anti_pattern" })],
    l2Rules: ["notion_operator: [通用] always include parent page id"],
    l3Matches: undefined,
  };
}

describe("memory detail builder", () => {
  it("builds planner details for L1, L2, L3, and anti-pattern memories", () => {
    const details = buildPlannerNodeMemoryDetails({
      memories: makeRetrievedMemories(),
      refresh: { refreshed: true, mode: "full", consumer: "planner", reason: "entry" },
    });

    assert.equal(details.consumer, "planner");
    assert.equal(details.items.length, 4);
    assert.deepEqual(details.items.map((item) => item.level), ["L1", "L2", "L3", "L3"]);
    assert.equal(details.items[0].injectionSurface, "l1OperationalExperience");
    assert.equal(details.items[1].injectionSurface, "available_skills");
    assert.equal(details.items[3].memoryType, "anti_pattern");
  });

  it("builds executor details only from selected L1 hints", () => {
    const details = buildExecutorNodeMemoryDetails({
      l1Items: [makeL1()],
      selectedHints: ["click submit"],
      refresh: { refreshed: false, mode: "reuse", consumer: "executor", reason: "execution" },
    });

    assert.equal(details.consumer, "executor");
    assert.equal(details.items.length, 1);
    assert.equal(details.items[0].level, "L1");
    assert.equal(details.items[0].injectionSurface, "HybridUIExecutor L1 hints");
  });
});
