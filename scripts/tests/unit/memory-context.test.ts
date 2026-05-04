import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildHarnessMemoryContext } from "../../../src/core/planning/build-harness-memory-context.ts";
import { buildReplannerMemoryContext } from "../../../src/memory/retrieval/memory-prompt-builder.ts";
import type { MemoryItem } from "../../../src/shared/types/memory.ts";

function makeL1(): MemoryItem {
  const now = Date.now();
  return {
    id: "l1",
    type: "L1_HINT",
    title: "l1",
    content: "l1",
    tags: ["domain:example.com"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      domain: "example.com",
      pathPattern: "/docs",
      elementSelector: "#app",
      actionType: "click",
      executionCount: 1,
      successCount: 1,
      physicalInstruction: "click the publish button",
    },
  };
}

function makeL3(input: { id: string; title: string; tacticalRules: string; memoryType?: "positive" | "anti_pattern" }): MemoryItem {
  const now = Date.now();
  return {
    id: input.id,
    type: "L3_WORKFLOW",
    title: input.title,
    content: `${input.title} ${input.tacticalRules}`,
    tags: ["taskType:publish"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      intentQuery: "publish article",
      taskType: "publish",
      tacticalRules: input.tacticalRules,
      memoryType: input.memoryType ?? "positive",
    },
  };
}

describe("memory context builders", () => {
  it("builds planner harness context from structured L3 items", () => {
    const context = buildHarnessMemoryContext({
      retrieved_memories: {
        l1Items: [makeL1()],
        l2Rules: ["notion_operator: [通用] always include parent page id"],
        l3Items: [
          makeL3({ id: "l3-1", title: "Publish SOP", tacticalRules: "open editor first" }),
          makeL3({ id: "l3-2", title: "Review SOP", tacticalRules: "check preview before submit" }),
        ],
      },
    });

    assert.match(context.l1Section, /历史操作经验/);
    assert.match(context.memoryContext, /L2 Domain Rules/);
    assert.match(context.memoryContext, /Publish SOP/);
    assert.match(context.memoryContext, /Review SOP/);
    assert.doesNotMatch(context.memoryContext, /click the publish button/);
  });

  it("includes anti-pattern guidance in replanner memory context", () => {
    const context = buildReplannerMemoryContext({
      l1Items: [makeL1()],
      l3Items: [makeL3({ id: "l3", title: "Publish SOP", tacticalRules: "open editor first" })],
      antiPatternL3Items: [
        makeL3({
          id: "anti",
          title: "Bad SOP",
          tacticalRules: "do not submit before preview",
          memoryType: "anti_pattern",
        }),
      ],
    });

    assert.match(context, /历史失败教训/);
    assert.match(context, /do not submit before preview/);
  });
});
