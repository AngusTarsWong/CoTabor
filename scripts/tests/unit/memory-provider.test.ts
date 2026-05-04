import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { memoryProvider } from "../../../src/memory/store/memory-provider.ts";
import { memoryStore } from "../../../src/memory/store/indexeddb.ts";
import type { MemoryItem } from "../../../src/shared/types/memory.ts";

function makeMemoryItem(input: {
  id: string;
  type: MemoryItem["type"];
  tags: string[];
}): MemoryItem {
  const now = Date.now();
  return {
    id: input.id,
    type: input.type,
    title: input.id,
    content: input.id,
    tags: input.tags,
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: input.type === "L1_HINT"
      ? {
          domain: "example.com",
          pathPattern: "/",
          elementSelector: "#app",
          actionType: "click",
          executionCount: 1,
          successCount: 1,
          physicalInstruction: "click the primary button",
        }
      : input.type === "L2_RULE"
        ? {
            skillName: "notion_operator",
            parameterRules: "always include parent page id",
            hitCount: 1,
            successCount: 1,
            status: "active",
          }
        : {
            intentQuery: "publish article",
            tacticalRules: "open the editor and paste content",
          },
  };
}

describe("memoryProvider.search", () => {
  beforeEach(async () => {
    await memoryStore._clearAll();
  });

  it("applies type and anyTags together", async () => {
    await memoryProvider.save(makeMemoryItem({
      id: "l1-match",
      type: "L1_HINT",
      tags: ["domain:example.com"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "l1-other-domain",
      type: "L1_HINT",
      tags: ["domain:other.com"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "l2-same-tag",
      type: "L2_RULE",
      tags: ["domain:example.com", "skill:notion_operator"],
    }));

    const results = await memoryProvider.search({
      type: "L1_HINT",
      anyTags: ["domain:example.com"],
      limit: 10,
    });

    assert.deepEqual(results.map((item) => item.id), ["l1-match"]);
  });

  it("requires all requiredTags to match", async () => {
    await memoryProvider.save(makeMemoryItem({
      id: "both-tags",
      type: "L2_RULE",
      tags: ["skill:notion_operator", "taskType:create_page"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "only-skill",
      type: "L2_RULE",
      tags: ["skill:notion_operator"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "only-task-type",
      type: "L2_RULE",
      tags: ["taskType:create_page"],
    }));

    const results = await memoryProvider.search({
      type: "L2_RULE",
      requiredTags: ["skill:notion_operator", "taskType:create_page"],
      limit: 10,
    });

    assert.deepEqual(results.map((item) => item.id), ["both-tags"]);
  });

  it("supports combining anyTags and requiredTags", async () => {
    await memoryProvider.save(makeMemoryItem({
      id: "match",
      type: "L3_WORKFLOW",
      tags: ["domain:example.com", "taskType:publish", "lang:zh"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "missing-required",
      type: "L3_WORKFLOW",
      tags: ["domain:example.com", "lang:zh"],
    }));
    await memoryProvider.save(makeMemoryItem({
      id: "missing-any",
      type: "L3_WORKFLOW",
      tags: ["taskType:publish", "lang:zh"],
    }));

    const results = await memoryProvider.search({
      type: "L3_WORKFLOW",
      anyTags: ["domain:example.com"],
      requiredTags: ["taskType:publish", "lang:zh"],
      limit: 10,
    });

    assert.deepEqual(results.map((item) => item.id), ["match"]);
  });
});
