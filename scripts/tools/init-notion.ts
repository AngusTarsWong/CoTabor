import 'dotenv/config';

// Inject Proxy for Notion API calls if in China
if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = 'http://127.0.0.1:6789';
}
if (!process.env.HTTP_PROXY && !process.env.http_proxy) {
  process.env.HTTP_PROXY = 'http://127.0.0.1:6789';
}

import { initializeNotionBrainBase } from '../src/skills/bundled/notion-operator/init';

const apiKey = process.env.VITE_NOTION_API_KEY || 'NOTION_API_KEY_PLACEHOLDER';
const L1MuscleId = "349866f2-5413-81d5-a851-d03f0f9bd55d";

async function run() {
  console.log('🚀 获取 Notion Parent Page ID...');
  const res = await fetch(`https://api.notion.com/v1/databases/${L1MuscleId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28'
    }
  });

  if (!res.ok) {
    console.error('获取失败:', await res.text());
    return;
  }

  const data = await res.json();
  const parentPageId = data.parent.page_id;
  console.log(`✅ 找到 Parent Page ID: ${parentPageId}`);

  console.log('\n🚀 重新初始化 Notion 数据库...');
  const config = await initializeNotionBrainBase({
    apiKey,
    parentPageId
  });

  console.log('\n🎉 初始化完成！新的表格 ID 如下：');
  console.log(JSON.stringify(config, null, 2));
}

run();