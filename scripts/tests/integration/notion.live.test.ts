import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = "http://127.0.0.1:6789";
  process.env.HTTP_PROXY = "http://127.0.0.1:6789";
}

import { NotionTableOperator } from "../../../src/skills/bundled/notion-operator/api";
import { extractNotionPageId, initializeNotionBrainBase } from "../../../src/skills/bundled/notion-operator/init";

const apiKey = process.env.NOTION_API_KEY || process.env.VITE_NOTION_API_KEY || "";
const parentPageId = process.env.NOTION_PARENT_PAGE_ID || "";
const parentPageUrl = process.env.NOTION_PARENT_PAGE_URL || "";

describe("Integration: Notion Cloud DB API", { timeout: 30000 }, () => {
  it("should initialize databases and write memory records to Notion", async () => {
    if (!apiKey) {
      assert.fail("Missing NOTION_API_KEY. Skipping test.");
    }
    
    const resolvedParentPageId = parentPageId || (parentPageUrl ? extractNotionPageId(parentPageUrl) : "");
    if (!resolvedParentPageId) {
      assert.fail("Missing NOTION_PARENT_PAGE_ID or URL. Skipping test.");
    }

    const config = await initializeNotionBrainBase({ apiKey, parentPageId: resolvedParentPageId });
    assert.ok(config.tableIds, "Should return table IDs");
    
    const operator = new NotionTableOperator(apiKey);
    const tableIds = config.tableIds;

    // L1 Write
    await operator.createRecord(tableIds.L1, {
      id: `l1_test_${Date.now()}`,
      domain: "news.baidu.com",
      pathPattern: "/*",
      elementSelector: "input[name='key']",
      actionType: "click",
      physicalInstruction: "点击搜索框",
      reason: "定位搜索入口",
      executionCount: 1,
      successCount: 1,
      updatedAt: Date.now()
    });

    // L2 Write
    await operator.createRecord(tableIds.L2, {
      id: `l2_test_${Date.now()}`,
      skillName: "notion_operator",
      ruleType: "param_format",
      contextScope: "global",
      parameterRules: "需要提供确切的页面指令",
      errorHistory: "none",
      hitCount: 1,
      successCount: 1,
      status: "active",
      updatedAt: Date.now()
    });

    // L3 Write
    await operator.createRecord(tableIds.L3, {
      id: `l3_test_${Date.now()}`,
      memoryTitle: "百度新闻搜索与提取策略",
      intentQuery: "百度新闻搜索",
      taskType: "information_extraction",
      domainScope: "news.baidu.com",
      language: "zh-CN",
      keywords: ["news", "search"],
      tacticalRules: "先定位顶部搜索框，搜索后直接点击第一条结果。",
      updatedAt: Date.now()
    });
  });
});
