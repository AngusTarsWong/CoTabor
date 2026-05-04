import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { memoryProvider } from "../../../src/memory/store/memory-provider.ts";
import { memoryStore } from "../../../src/memory/store/indexeddb.ts";
import { retrieveL1ItemsByUrl } from "../../../src/memory/retrieval/l1-rule-retriever.ts";
import { retrieveAllL2ItemsForSkill, retrieveL2RulesBySkillNames } from "../../../src/memory/retrieval/l2-rule-retriever.ts";
import { queryRuleSkill } from "../../../src/skills/bundled/system-memory/query-rule.ts";
import type { MemoryItem } from "../../../src/shared/types/memory.ts";

function makeL1(input: {
  id: string;
  domain: string;
  tags?: string[];
  pathPattern?: string;
}): MemoryItem {
  const now = Date.now();
  return {
    id: input.id,
    type: "L1_HINT",
    title: input.id,
    content: input.id,
    tags: input.tags ?? [`domain:${input.domain}`],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      domain: input.domain,
      pathPattern: input.pathPattern ?? "/docs",
      elementSelector: "#app",
      actionType: "click",
      executionCount: 1,
      successCount: 1,
      physicalInstruction: `operate on ${input.domain}`,
    },
  };
}

function makeL2(input: {
  id: string;
  skillName: string;
  parameterRules: string;
  tags?: string[];
  contextScope?: string;
  ruleScope?: "base" | "contextual";
  status?: "active" | "archived" | "needs_review";
  hitCount?: number;
  successCount?: number;
}): MemoryItem {
  const now = Date.now();
  return {
    id: input.id,
    type: "L2_RULE",
    title: input.id,
    content: input.parameterRules,
    tags: input.tags ?? [
      `skill:${input.skillName}`,
      ...(input.contextScope ? [`taskType:${input.contextScope}`] : []),
    ],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      skillName: input.skillName,
      parameterRules: input.parameterRules,
      contextScope: input.contextScope,
      ruleScope: input.ruleScope,
      hitCount: input.hitCount ?? 1,
      successCount: input.successCount ?? 1,
      status: input.status ?? "active",
    },
  };
}

describe("memory retrievers", () => {
  beforeEach(async () => {
    await memoryStore._clearAll();
  });

  it("L1 retriever re-checks domain at caller side", async () => {
    await memoryProvider.save(makeL1({ id: "match", domain: "example.com" }));
    await memoryProvider.save(makeL1({
      id: "spoofed-tag",
      domain: "other.com",
      tags: ["domain:example.com"],
    }));

    const results = await retrieveL1ItemsByUrl("https://example.com/docs");

    assert.deepEqual(results.map((item) => item.id), ["match"]);
  });

  it("L2 retriever filters by skill, taskType, and active status", async () => {
    await memoryProvider.save(makeL2({
      id: "base-active",
      skillName: "notion_operator",
      parameterRules: "base active",
      ruleScope: "base",
      hitCount: 5,
    }));
    await memoryProvider.save(makeL2({
      id: "ctx-active",
      skillName: "notion_operator",
      parameterRules: "ctx active",
      contextScope: "create_page",
      ruleScope: "contextual",
      hitCount: 7,
    }));
    await memoryProvider.save(makeL2({
      id: "ctx-archived",
      skillName: "notion_operator",
      parameterRules: "ctx archived",
      contextScope: "create_page",
      ruleScope: "contextual",
      status: "archived",
      hitCount: 99,
    }));
    await memoryProvider.save(makeL2({
      id: "wrong-skill",
      skillName: "feishu_operator",
      parameterRules: "wrong skill",
      tags: ["skill:notion_operator", "taskType:create_page"],
      contextScope: "create_page",
      ruleScope: "contextual",
      hitCount: 100,
    }));

    const all = await retrieveAllL2ItemsForSkill("notion_operator");
    assert.deepEqual(all.map((item) => item.id), ["ctx-active", "base-active"]);

    const pair = (await retrieveL2RulesBySkillNames(["notion_operator"], "create_page")).get("notion_operator");
    assert.equal(pair?.base?.id, "base-active");
    assert.equal(pair?.contextual?.id, "ctx-active");
  });

  it("query_rule reuses the same filtered L2 dataset", async () => {
    await memoryProvider.save(makeL2({
      id: "base",
      skillName: "notion_operator",
      parameterRules: "base rule",
      ruleScope: "base",
    }));
    await memoryProvider.save(makeL2({
      id: "ctx",
      skillName: "notion_operator",
      parameterRules: "ctx rule",
      contextScope: "create_page",
      ruleScope: "contextual",
    }));
    await memoryProvider.save(makeL2({
      id: "archived",
      skillName: "notion_operator",
      parameterRules: "archived rule",
      status: "archived",
    }));

    const raw = await queryRuleSkill.execute({ skillName: "notion_operator", taskType: "create_page" });
    const payload = JSON.parse(raw);

    assert.deepEqual(
      payload.rules.map((rule: { id: string }) => rule.id),
      ["ctx"],
    );
  });
});
