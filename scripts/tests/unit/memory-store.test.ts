
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../../../src/memory/store/indexeddb.js";
import { l3Bm25Index } from "../../../src/memory/retrieval/l3-bm25-index.js";
import { expandViaGraph } from "../../../src/memory/retrieval/graph-traversal.js";
import type { L3TacticalMemory, MemoryAttributionRecord, MemoryEdge } from "../../../src/shared/types/memory.js";

function makeL3Rule(input: Partial<L3TacticalMemory> & Pick<L3TacticalMemory, "id" | "tacticalRules">): L3TacticalMemory {
  return {
    intentQuery: "github login automation",
    memoryTitle: "GitHub login automation",
    taskType: "github_login",
    domainScope: "github.com",
    language: "latin",
    keywords: ["github", "login", "automation"],
    updatedAt: Date.now(),
    stability: 2,
    lastAccessedAt: Date.now(),
    memoryType: "positive",
    ...input,
  };
}

function makeEdge(id: string, sourceId: string, targetId: string, overrides: Partial<MemoryEdge> = {}): MemoryEdge {
  return {
    id,
    sourceId,
    targetId,
    relation: "co_occurs",
    weight: 0.9,
    coOccurrenceCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  await (memoryStore as any)._clearAll();
  await l3Bm25Index.rebuild([]);
});

describe("memoryStore._clearAll", () => {
  it("clears attribution and edge stores", async () => {
    const attribution: MemoryAttributionRecord = {
      id: "attr_1",
      taskRunId: "run_test",
      memoryId: "tac_seed",
      memoryLevel: "L3",
      retrievedAt: Date.now(),
    };
    await memoryStore.putAttribution(attribution);
    await memoryStore.putEdge(makeEdge("edge_1", "tac_a", "tac_b"));
    await memoryStore.putL3Rule(makeL3Rule({ id: "tac_seed", tacticalRules: "Use normal login flow." }));

    await (memoryStore as any)._clearAll();

    assert.deepEqual(await memoryStore.getAttributionsByTaskRun("run_test"), []);
    assert.deepEqual(await memoryStore.getEdgesForMemory("tac_a"), []);
    assert.deepEqual(await memoryStore.getAllL3Rules(), []);
  });
});

describe("expandViaGraph", () => {
  it("routes positive neighbours and anti-pattern neighbours to separate buckets", async () => {
    const seed = makeL3Rule({ id: "seed", tacticalRules: "Wait for login form before typing." });
    const antiPattern = makeL3Rule({ id: "anti", memoryType: "anti_pattern", tacticalRules: "Do not submit before password is set." });
    const positiveNeighbour = makeL3Rule({ id: "pos", tacticalRules: "After login, wait for navigation." });

    await memoryStore.putL3Rule(seed);
    await memoryStore.putL3Rule(antiPattern);
    await memoryStore.putL3Rule(positiveNeighbour);
    await memoryStore.putEdge(makeEdge("e1", "seed", "anti"));
    await memoryStore.putEdge(makeEdge("e2", "seed", "pos", { relation: "extends" as any, coOccurrenceCount: 0 }));

    const expanded = await expandViaGraph([seed], []);

    assert.deepEqual(expanded.expandedPositive.map((r) => r.id), ["pos"]);
    assert.deepEqual(expanded.expandedAntiPattern.map((r) => r.id), ["anti"]);
  });
});

describe("l3Bm25Index", () => {
  it("ranks the more relevant rule first in a small collection", async () => {
    const loginRule = makeL3Rule({
      id: "tac_login",
      tacticalRules: "GitHub login automation should wait for the form and then type credentials.",
    });
    const unrelatedRule = makeL3Rule({
      id: "tac_notion",
      intentQuery: "notion database setup",
      memoryTitle: "Notion database setup",
      taskType: "notion_setup",
      domainScope: "notion.so",
      keywords: ["notion", "database"],
      tacticalRules: "Create Notion databases only after checking parent page permissions.",
    });

    await l3Bm25Index.rebuild([loginRule, unrelatedRule]);
    const results = await l3Bm25Index.search("github login automation", { limit: 2 });

    assert.equal(results.length, 2);
    assert.equal(results[0].id, "tac_login");
  });
});
