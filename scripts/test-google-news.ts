import 'dotenv/config';
import puppeteer, { CDPSession, Browser } from 'puppeteer-core';
import { setCdpClient, CdpClient } from '../src/drivers/cdp/index';
import { getVisionDriver } from '../src/drivers/vision/index';
import { ClawAgent } from '../src/lib/claw/agent';

class PuppeteerAdapter implements CdpClient {
  constructor(private session: CDPSession, private virtualTabId: number) {}
  async attach() {}
  async detach() {}
  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    return this.session.send(method as any, params as any) as Promise<Res>;
  }
}

async function run() {
  console.log('==========================================');
  console.log('🚀 CoTabor E2E 测试: 谷歌新闻 → 飞书文档');
  console.log('==========================================\n');

  const EXECUTABLE_PATH = process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  
  console.log('⏳ [1/4] 拉起 Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: EXECUTABLE_PATH,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox']
  });

  const page = await browser.newPage();
  const client = await page.createCDPSession();
  const VIRTUAL_TAB_ID = 999999;
  
  console.log('⏳ [2/4] 注入 CDP 驱动...');
  setCdpClient(new PuppeteerAdapter(client, VIRTUAL_TAB_ID) as any);

  console.log('⏳ [3/4] 唤醒视觉中枢...');
  await getVisionDriver().init({ type: 'puppeteer', page } as any);

  console.log('⏳ [4/4] 启动智能大脑...\n');

  const agent = new ClawAgent({
    tabId: VIRTUAL_TAB_ID,
    goal: [
      "请完成以下端到端任务：",
      "1) 打开谷歌新闻中文版：https://news.google.com/?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
      "2) 浏览首屏新闻内容，生成一段精炼的中文新闻摘要（包含3-5个要点，每个要点一句话）",
      "3) 使用 memorize 技能将摘要文本保存到 key='news_summary'",
      "4) 调用 feishu_operator 技能，传入指令：'请根据以下内容创建一个新的飞书文档，标题为「谷歌新闻每日摘要」，内容为：' 加上你刚才总结的新闻摘要",
      "5) 任务完成后输出 finish，在 description 中包含飞书文档的链接（如果有返回的话）和摘要内容"
    ].join("\n"),
    onLog: (msg) => {
      if (msg.includes('Thinking') || msg.includes('Decided') || msg.includes('Executing') || msg.includes('feishu')) {
        console.log(`🧠 ${msg}`);
      }
    },
    onStep: (step) => {
      if (step.node === 'planner' && step.state?.planner_output?.action) {
        const action = step.state.planner_output.action;
        console.log(`\n🎯 [Step ${step.state?.total_history?.length || '?'}] ${action.type}${action.skill_name ? `(${action.skill_name})` : ''} → ${action.description || ''}`);
      }
      if (step.node === 'executor' && step.state?.meta_data?.page_content) {
        const content = step.state.meta_data.page_content;
        if (content.includes('feishu_operator')) {
          console.log(`\n📄 [飞书返回] ${content.substring(0, 500)}`);
        }
      }
    },
    onFinish: (result) => {
      console.log('\n==========================================');
      console.log('🏆 端到端任务完成！');
      console.log('==========================================');
      console.log(result?.output || JSON.stringify(result, null, 2));
      console.log('------------------------------------------');
      
      setTimeout(() => process.exit(0), 10000);
    },
    onError: (err) => {
      console.error('❌ Agent 崩溃:', err);
      process.exit(1);
    }
  });

  await agent.start();
}

run().catch(console.error);
