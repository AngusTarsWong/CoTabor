
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../../../src/memory/store/indexeddb.js";
import { l3Bm25Index } from "../../../src/memory/retrieval/l3-bm25-index.js";
import { retrieveTaskMemories } from "../../../src/memory/retrieval/memory-retriever.js";
import { rerankWithVector } from "../../../src/memory/retrieval/vector-reranker.js";
import type { L2SkillMemory, L3RetrievalMatch, L3TacticalMemory } from "../../../src/shared/types/memory.js";
import type { Skill } from "../../../src/skills/types.js";

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

function makeL2Rule(input: Partial<L2SkillMemory> & Pick<L2SkillMemory, "id" | "skillName" | "parameterRules">): L2SkillMemory {
  return {
    ruleType: "general",
    status: "active",
    updatedAt: Date.now(),
    stability: 2,
    lastAccessedAt: Date.now(),
    hitCount: 1,
    successCount: 1,
    ...input,
  };
}

function makeSkill(name: string): Skill {
  return {
    name,
    description: `${name} base description`,
    role: "action",
    params: {},
    type: "local",
    execute: async () => null,
    getManual: async () => "",
  };
}

async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 1000,
): Promise<T> {
  const startedAt = Date.now();
  let last = await producer();
  while (!predicate(last) && Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, 20));
    last = await producer();
  }
  assert.equal(predicate(last), true, "waitFor condition never became true");
  return last;
}

beforeEach(async () => {
  await (memoryStore as any)._clearAll();
  await l3Bm25Index.rebuild([]);
});

describe("retrieveTaskMemories — anti-patterns", () => {
  it("keeps anti-pattern rules out of positive context but in warning context", async () => {
    const seed = makeL3Rule({ id: "seed", tacticalRules: "Wait for login form before typing." });
    const antiPattern = makeL3Rule({ id: "anti", memoryType: "anti_pattern", tacticalRules: "Do not submit before password." });

    await memoryStore.putL3Rule(seed);
    await memoryStore.putL3Rule(antiPattern);
    await memoryStore.putEdge({
      id: "e1", sourceId: "seed", targetId: "anti",
      relation: "co_occurs", weight: 0.9, coOccurrenceCount: 1,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await l3Bm25Index.rebuild([seed, antiPattern]);

    const result = await retrieveTaskMemories({
      request: "github login automation",
      currentUrl: "https://github.com/login",
      skills: [],
      taskRunId: "run_anti_test",
    });

    assert.equal(result.l3Rules.some((r) => r.id === "anti"), false);
    assert.equal(result.antiPatternL3Rules.some((r) => r.id === "anti"), true);
    assert.match(result.ragContext, /历史失败教训/);
  });
});

describe("retrieveTaskMemories — L2 contextual rules and attribution", () => {
  it("injects base and contextual L2 rules into skill description and writes attribution records", async () => {
    await memoryStore.putL2Rule(makeL2Rule({
      id: "skl_base",
      skillName: "browser_click",
      ruleScope: "base",
      parameterRules: "Always pass the visible element index.",
    }));
    await memoryStore.putL2Rule(makeL2Rule({
      id: "skl_ctx",
      skillName: "browser_click",
      contextScope: "github_login",
      ruleScope: "contextual",
      parameterRules: "For GitHub login, wait for the password field before clicking submit.",
    }));

    const result = await retrieveTaskMemories({
      request: "github login automation",
      currentUrl: "https://github.com/login",
      skills: [makeSkill("browser_click")],
      taskRunId: "run_l2_test",
      taskType: "github_login",
    });

    const enrichedDesc = result.skillDescriptions.get("browser_click") ?? "";
    assert.match(enrichedDesc, /Always pass the visible element index/);
    assert.match(enrichedDesc, /wait for the password field/);

    const attributions = await waitFor(
      () => memoryStore.getAttributionsByTaskRun("run_l2_test"),
      (records) => records.length >= 2,
    );
    const ids = new Set(attributions.map((r) => r.memoryId));
    assert.equal(ids.has("skl_base"), true);
    assert.equal(ids.has("skl_ctx"), true);
  });
});

describe("rerankWithVector", () => {
  it("promotes the semantically closer rule to first position", () => {
    const relevant = makeL3Rule({ id: "relevant", tacticalRules: "Use login form after it is visible.", embedding: [1, 0] });
    const weaker = makeL3Rule({ id: "weaker", tacticalRules: "Read unrelated repository content.", embedding: [0, 1] });

    const matches: L3RetrievalMatch[] = [
      { memory: weaker, score: 3, scoreBreakdown: { bm25: 3, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 } },
      { memory: relevant, score: 1, scoreBreakdown: { bm25: 1, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 } },
    ];

    const reranked = rerankWithVector(matches, [1, 0], 2);

    assert.equal(reranked[0].memory.id, "relevant");
    assert.equal(reranked[0].scoreBreakdown.cosine, 1);
  });

  it("leaves order unchanged when no embeddings are present", () => {
    const a = makeL3Rule({ id: "a", tacticalRules: "Rule A" });
    const b = makeL3Rule({ id: "b", tacticalRules: "Rule B" });
    const matches: L3RetrievalMatch[] = [
      { memory: a, score: 5, scoreBreakdown: { bm25: 5, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 } },
      { memory: b, score: 3, scoreBreakdown: { bm25: 3, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 } },
    ];
    const reranked = rerankWithVector(matches, [1, 0], 2);
    assert.equal(reranked[0].memory.id, "a");
  });
});
