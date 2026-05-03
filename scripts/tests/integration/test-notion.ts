import 'dotenv/config';

// Inject Proxy for Notion API calls if in China
if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = 'http://127.0.0.1:6789';
}
if (!process.env.HTTP_PROXY && !process.env.http_proxy) {
  process.env.HTTP_PROXY = 'http://127.0.0.1:6789';
}

import { NotionTableOperator } from '../../../src/skills/bundled/notion-operator/api';
import { extractNotionPageId, initializeNotionBrainBase } from '../../../src/skills/bundled/notion-operator/init';
import { L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from '../../../src/shared/types/memory';

const apiKey = process.env.NOTION_API_KEY || process.env.VITE_NOTION_API_KEY || '';
const parentPageId = process.env.NOTION_PARENT_PAGE_ID || '';
const parentPageUrl = process.env.NOTION_PARENT_PAGE_URL || '';

async function run() {
  if (!apiKey) {
    console.error('❌ Missing NOTION_API_KEY or VITE_NOTION_API_KEY. Cannot run the Notion integration test.');
    process.exitCode = 1;
    return;
  }

  const resolvedParentPageId = parentPageId || (parentPageUrl ? extractNotionPageId(parentPageUrl) : '');
  if (!resolvedParentPageId) {
    console.error('❌ Missing NOTION_PARENT_PAGE_ID or NOTION_PARENT_PAGE_URL. Cannot initialize the Notion memory workspace.');
    process.exitCode = 1;
    return;
  }

  console.log('🚀 1. Initializing Notion databases...');

  const config = await initializeNotionBrainBase({
    apiKey,
    parentPageId: resolvedParentPageId
  });
  
  console.log('\n✅ Initialization complete. Current database IDs:');
  console.log(config.tableIds);

  console.log('\n🚀 2. Running standalone writes for the three-layer Notion memory stack...');
  const operator = new NotionTableOperator(apiKey);
  const tableIds = config.tableIds;

  try {
    console.log('\n⏳ 2.1 Writing L1 muscle memory...');
    await operator.createRecord(tableIds.L1, {
      id: `l1_test_${Date.now()}`,
      domain: 'news.baidu.com',
      pathPattern: '/*',
      elementSelector: 'input[name="key"]',
      actionType: 'click',
      physicalInstruction: '点击搜索框',
      reason: '定位搜索入口',
      executionCount: 1,
      successCount: 1,
      updatedAt: Date.now()
    } as unknown as L1MuscleMemory);
    console.log('✅ L1 write succeeded.\n');

    console.log('⏳ 2.2 Writing L2 skill memory...');
    await operator.createRecord(tableIds.L2, {
      id: `l2_test_${Date.now()}`,
      skillName: 'notion_operator',
      ruleType: 'param_format',
      contextScope: 'global',
      parameterRules: '需要提供确切的页面指令',
      errorHistory: 'none',
      hitCount: 1,
      successCount: 1,
      status: 'active',
      updatedAt: Date.now()
    } as unknown as L2SkillMemory);
    console.log('✅ L2 write succeeded.\n');

    console.log('⏳ 2.3 Writing L3 tactical memory...');
    await operator.createRecord(tableIds.L3, {
      id: `l3_test_${Date.now()}`,
      memoryTitle: '百度新闻搜索与提取策略',
      intentQuery: '百度新闻搜索',
      taskType: 'information_extraction',
      domainScope: 'news.baidu.com',
      language: 'zh-CN',
      keywords: ['news', 'search'],
      tacticalRules: '先定位顶部搜索框，搜索后直接点击第一条结果。',
      updatedAt: Date.now()
    } as unknown as L3TacticalMemory);
    console.log('✅ L3 write succeeded.\n');

    console.log('🎉 Test complete. All three memory layers were written to Notion successfully.');
  } catch (error) {
    console.error('❌ Memory write test failed:', error);
  }
}

run();
