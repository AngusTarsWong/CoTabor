import 'dotenv/config';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

/**
 * 测试 Turndown + Readability 感知层效果
 * 对比：原始 HTML → Readability 清洁 → Turndown Markdown 的 Token 压缩效果
 */
async function testExtraction() {
  console.log('==========================================');
  console.log('📊 CoTabor - 感知层 Markdown 化 测试');
  console.log('==========================================\n');

  // 测试目标：谷歌新闻（动态网页的典型代表）
  const targetUrl = 'https://en.wikipedia.org/wiki/Artificial_intelligence';
  console.log(`⏳ 正在抓取: ${targetUrl}`);
  
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();

  console.log(`✅ 抓取成功！`);
  console.log(`   原始 HTML 大小: ${html.length} 字符 (~${Math.round(html.length / 4)} tokens)\n`);

  // ===== Step 1: Readability 清洁 =====
  console.log('--- Step 1: @mozilla/readability 过滤噪音 ---');
  const dom = new JSDOM(html, { url: targetUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    console.error('❌ Readability 解析失败，页面结构太复杂或无正文');
    return;
  }

  console.log(`✅ Readability 输出:`);
  console.log(`   标题: ${article.title}`);
  console.log(`   byline: ${article.byline || '(none)'}`);
  console.log(`   纯文本长度: ${article.textContent.length} 字符\n`);

  // ===== Step 2: Turndown 转 Markdown =====
  console.log('--- Step 2: Turndown 转换为 Markdown ---');
  const td = new TurndownService({
    headingStyle: 'atx',       // # H1, ## H2
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    strongDelimiter: '**',
    emDelimiter: '*',
  });

  // 移除不必要的元素规则
  td.remove(['script', 'style', 'nav', 'footer', 'aside', 'figure']);

  const markdown = td.turndown(article.content);

  console.log(`✅ Turndown 转换完成:`);
  console.log(`   Markdown 大小: ${markdown.length} 字符 (~${Math.round(markdown.length / 4)} tokens)`);
  console.log(`   压缩率: ${(100 - (markdown.length / html.length) * 100).toFixed(1)}%\n`);

  console.log('==========================================');
  console.log('📝 Markdown 预览 (前 1200 字符):');
  console.log('==========================================');
  console.log(markdown.substring(0, 1200));
  console.log('\n... [截断] ...\n');
  console.log('==========================================');
  console.log('📊 总结');
  console.log('==========================================');
  console.log(`原始 HTML:   ${html.length} chars  (~${Math.round(html.length / 4).toLocaleString()} tokens)`);
  console.log(`Readability: ${article.textContent.length} chars  (~${Math.round(article.textContent.length / 4).toLocaleString()} tokens)`);
  console.log(`Turndown MD: ${markdown.length} chars  (~${Math.round(markdown.length / 4).toLocaleString()} tokens)`);
  console.log(`节省了 ${(100 - (markdown.length / html.length) * 100).toFixed(1)}% 的 Token 消耗！`);
}

testExtraction().catch(console.error);
