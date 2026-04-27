import 'dotenv/config';

// Inject Proxy for Notion API calls if in China
if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = 'http://127.0.0.1:6789';
}
if (!process.env.HTTP_PROXY && !process.env.http_proxy) {
  process.env.HTTP_PROXY = 'http://127.0.0.1:6789';
}

import { NotionTableOperator } from '../../src/skills/bundled/notion-operator/api';
import { initializeNotionBrainBase } from '../../src/skills/bundled/notion-operator/init';
import { L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from '../../src/shared/types/memory';

const apiKey = process.env.VITE_NOTION_API_KEY || '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';

// 旧的 L1 表格 ID，用于反查 Parent Page ID
const OLD_L1_ID = "349866f2-5413-81d5-a851-d03f0f9bd55d";

async function run() {
  console.log('🚀 1. 获取 Notion Parent Page ID...');
  const res = await fetch(`https://api.notion.com/v1/databases/${OLD_L1_ID}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28'
    }
  });

  if (!res.ok) {
    console.error('获取 Parent Page ID 失败:', await res.text());
    return;
  }

  const data = await res.json();
  const parentPageId = data.parent.page_id;
  console.log(`✅ 找到 Parent Page ID: ${parentPageId}`);

  console.log('\n🚀 2. 重新初始化 Notion 数据库...');
  const config = await initializeNotionBrainBase({
    apiKey,
    parentPageId
  });
  
  console.log('\n✅ 初始化完成！当前表格 ID 如下：');
  console.log(config.tableIds);

  console.log('\n🚀 3. 开始独立测试 Notion 3层记忆写入能力...');
  const operator = new NotionTableOperator(apiKey);
  const tableIds = config.tableIds;

  try {
    console.log('\n⏳ 3.1 测试写入 L1 肌肉记忆 (Muscle Memory)...');
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
    console.log('✅ L1 写入成功！\n');

    console.log('⏳ 3.2 测试写入 L2 技能记忆 (Skill Memory)...');
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
    console.log('✅ L2 写入成功！\n');

    console.log('⏳ 3.3 测试写入 L3 战术记忆 (Tactical Memory)...');
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
    console.log('✅ L3 写入成功！\n');

    console.log('🎉 测试完成！三层记忆成功打通 Notion Database！');
  } catch (error) {
    console.error('❌ 写入测试失败:', error);
  }
}

run();
