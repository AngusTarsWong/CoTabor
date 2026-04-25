import "dotenv/config";
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { memoryStore } from "../../src/memory/store/indexeddb";
import { l3Bm25Index } from "../../src/memory/retrieval/l3-bm25-index";
import { expandViaGraph } from "../../src/memory/retrieval/graph-traversal";
import { retrieveTaskMemories } from "../../src/memory/retrieval/memory-retriever";
import { rerankWithVector } from "../../src/memory/retrieval/vector-reranker";
import { L2SkillMemory, L3RetrievalMatch, L3TacticalMemory, MemoryAttributionRecord, MemoryEdge } from "../../src/shared/types/memory";
import type { Skill } from "../../src/skills/types";

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

async function resetMemoryStore() {
  await (memoryStore as any)._clearAll();
  await l3Bm25Index.rebuild([]);
}

async function waitFor<T>(producer: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 1000): Promise<T> {
  const startedAt = Date.now();
  let lastValue = await producer();
  while (!predicate(lastValue) && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    lastValue = await producer();
  }
  assert.equal(predicate(lastValue), true);
  return lastValue;
}

async function testClearAllClearsNewStores() {
  await resetMemoryStore();

  const attribution: MemoryAttributionRecord = {
    id: "attr_run_test_tac_seed",
    taskRunId: "run_test",
    memoryId: "tac_seed",
    memoryLevel: "L3",
    retrievedAt: Date.now(),
  };
  const edge: MemoryEdge = {
    id: "edge_tac_a_tac_b",
    sourceId: "tac_a",
    targetId: "tac_b",
    relation: "co_occurs",
    weight: 0.8,
    coOccurrenceCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await memoryStore.putAttribution(attribution);
  await memoryStore.putEdge(edge);
  await memoryStore.putL3Rule(makeL3Rule({ id: "tac_seed", tacticalRules: "Use the normal GitHub login flow." }));

  await resetMemoryStore();

  assert.deepEqual(await memoryStore.getAttributionsByTaskRun("run_test"), []);
  assert.deepEqual(await memoryStore.getEdgesForMemory("tac_a"), []);
  assert.deepEqual(await memoryStore.getAllL3Rules(), []);
}

async function testGraphExpansionKeepsAntiPatternsOutOfPositiveContext() {
  await resetMemoryStore();

  const seed = makeL3Rule({
    id: "tac_seed",
    tacticalRules: "When automating GitHub login, wait for the login form before typing credentials.",
  });
  const antiPattern = makeL3Rule({
    id: "tac_anti",
    memoryType: "anti_pattern",
    tacticalRules: "Do not submit the GitHub login form before the password field is populated.",
  });
  const positiveNeighbour = makeL3Rule({
    id: "tac_positive",
    tacticalRules: "After GitHub login succeeds, wait for navigation before reading repository content.",
  });

  await memoryStore.putL3Rule(seed);
  await memoryStore.putL3Rule(antiPattern);
  await memoryStore.putL3Rule(positiveNeighbour);
  await memoryStore.putEdge({
    id: "edge_tac_anti_tac_seed",
    sourceId: "tac_seed",
    targetId: "tac_anti",
    relation: "co_occurs",
    weight: 0.9,
    coOccurrenceCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await memoryStore.putEdge({
    id: "edge_tac_positive_tac_seed",
    sourceId: "tac_seed",
    targetId: "tac_positive",
    relation: "extends",
    weight: 0.9,
    coOccurrenceCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const expanded = await expandViaGraph([seed], []);

  assert.deepEqual(expanded.expandedPositive.map(rule => rule.id), ["tac_positive"]);
  assert.deepEqual(expanded.expandedAntiPattern.map(rule => rule.id), ["tac_anti"]);
}

async function testRetrievalKeepsAntiPatternsInWarningContext() {
  await resetMemoryStore();

  const seed = makeL3Rule({
    id: "tac_seed",
    tacticalRules: "When automating GitHub login, wait for the login form before typing credentials.",
  });
  const antiPattern = makeL3Rule({
    id: "tac_anti",
    memoryType: "anti_pattern",
    tacticalRules: "Do not submit the GitHub login form before the password field is populated.",
  });

  await memoryStore.putL3Rule(seed);
  await memoryStore.putL3Rule(antiPattern);
  await memoryStore.putEdge({
    id: "edge_tac_anti_tac_seed",
    sourceId: "tac_seed",
    targetId: "tac_anti",
    relation: "co_occurs",
    weight: 0.9,
    coOccurrenceCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await l3Bm25Index.rebuild([seed, antiPattern]);

  const result = await retrieveTaskMemories({
    request: "github login automation",
    currentUrl: "https://github.com/login",
    skills: [],
    taskRunId: "run_retrieval_test",
  });

  assert.equal(result.l3Rules.some(rule => rule.id === "tac_anti"), false);
  assert.equal(result.antiPatternL3Rules.some(rule => rule.id === "tac_anti"), true);
  assert.match(result.ragContext, /历史失败教训/);
}

async function testL2ContextualRulesAndAttribution() {
  await resetMemoryStore();

  await memoryStore.putL2Rule(makeL2Rule({
    id: "skl_base",
    skillName: "browser_click",
    ruleScope: "base",
    parameterRules: "Always pass the visible element index.",
  }));
  await memoryStore.putL2Rule(makeL2Rule({
    id: "skl_contextual",
    skillName: "browser_click",
    contextScope: "github_login",
    ruleScope: "contextual",
    parameterRules: "For GitHub login, wait for the password field before clicking submit.",
  }));

  const result = await retrieveTaskMemories({
    request: "github login automation",
    currentUrl: "https://github.com/login",
    skills: [makeSkill("browser_click")],
    taskRunId: "run_l2_contextual",
    taskType: "github_login",
  });

  const enrichedDescription = result.skillDescriptions.get("browser_click") || "";
  assert.match(enrichedDescription, /Always pass the visible element index/);
  assert.match(enrichedDescription, /wait for the password field/);
  assert.equal(result.l2Rules.some(rule => rule.includes("[通用]") && rule.includes("[github_login]")), true);

  const attributions = await waitFor(
    () => memoryStore.getAttributionsByTaskRun("run_l2_contextual"),
    (records) => records.length >= 2,
  );
  const attributedIds = new Set(attributions.map(record => record.memoryId));
  assert.equal(attributedIds.has("skl_base"), true);
  assert.equal(attributedIds.has("skl_contextual"), true);
}

async function testVectorRerankerPromotesSemanticMatch() {
  const relevant = makeL3Rule({
    id: "tac_vector_relevant",
    tacticalRules: "Use the GitHub login form after it is visible.",
    embedding: [1, 0],
  });
  const weaker = makeL3Rule({
    id: "tac_vector_weaker",
    tacticalRules: "Read unrelated repository content.",
    embedding: [0, 1],
  });
  const matches: L3RetrievalMatch[] = [
    {
      memory: weaker,
      score: 3,
      scoreBreakdown: { bm25: 3, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 },
    },
    {
      memory: relevant,
      score: 1,
      scoreBreakdown: { bm25: 1, domainBonus: 0, taskTypeBonus: 0, languageBonus: 0, successBonus: 0, usageBonus: 0, retentionBonus: 0 },
    },
  ];

  const reranked = rerankWithVector(matches, [1, 0], 2);

  assert.equal(reranked[0].memory.id, "tac_vector_relevant");
  assert.equal(reranked[0].scoreBreakdown.cosine, 1);
}

async function testSmallCollectionL3SearchWorks() {
  await resetMemoryStore();

  const loginRule = makeL3Rule({
    id: "tac_small_login",
    tacticalRules: "GitHub login automation should wait for the form and then type credentials.",
  });
  const unrelatedRule = makeL3Rule({
    id: "tac_small_unrelated",
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
  assert.equal(results[0].id, "tac_small_login");
}

async function runMemoryRegressionTests() {
  console.log("Running memory regression tests...");

  await testClearAllClearsNewStores();
  console.log("PASS clearAll clears attribution and edge stores");

  await testGraphExpansionKeepsAntiPatternsOutOfPositiveContext();
  console.log("PASS graph expansion keeps anti-patterns out of positive context");

  await testRetrievalKeepsAntiPatternsInWarningContext();
  console.log("PASS retrieval keeps anti-patterns in warning context");

  await testL2ContextualRulesAndAttribution();
  console.log("PASS L2 base/contextual rules and attribution records work");

  await testVectorRerankerPromotesSemanticMatch();
  console.log("PASS vector reranker promotes semantic matches");

  await testSmallCollectionL3SearchWorks();
  console.log("PASS L3 small-collection search works");

  console.log("ALL MEMORY REGRESSION TESTS PASSED");
}

runMemoryRegressionTests().catch((error) => {
  console.error("MEMORY REGRESSION TESTS FAILED", error);
  process.exitCode = 1;
});
