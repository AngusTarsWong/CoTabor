import 'dotenv/config';
import 'fake-indexeddb/auto';
// Add requestAnimationFrame and cancelAnimationFrame polyfills for Node environment
if (typeof requestAnimationFrame === 'undefined') {
  (global as any).requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
}
if (typeof cancelAnimationFrame === 'undefined') {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}
import puppeteer, { CDPSession, Browser } from 'puppeteer-core';
import { setCdpClient, CdpClient } from '../../src/drivers/cdp/index';
import { getVisionDriver } from '../../src/drivers/vision/index';
import { ClawAgent } from '../../src/lib/claw/agent';
import { IAgentLogger, LoggerConfig } from '../../src/shared/utils/logger/interface';
import { LarkMemoryProvider } from '../../src/shared/utils/memory/lark-memory';
import { perception } from '../../src/drivers/perception/index';
import { ProductionAdapter } from '../../src/drivers/perception/adapters/production';
import { ENV } from '../../src/shared/constants/env';

class ConsoleLogger implements IAgentLogger {
  async init(config: LoggerConfig) {}
  async logStep(step: { node: string; update: any }) {}
  async finish(finalState: any) {}
}

class PuppeteerAdapter implements CdpClient {
  private session: CDPSession;
  private virtualTabId: number;

  constructor(session: CDPSession, virtualTabId: number) {
    this.session = session;
    this.virtualTabId = virtualTabId;
  }
  async attach() { }
  async detach() { }
  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    return this.session.send(method as any, params as any) as Promise<Res>;
  }
}

async function run() {
  console.log('==========================================');
  console.log('🚀 CoTabor E2E 测试: 百度新闻 → 飞书文档 (飞书日志版)');
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

  console.log('⏳ [4/4] 启动智能大脑... (挂载 PageAgent + Midsense)\n');
  perception.setAdapter(new ProductionAdapter(ENV.MIDSENSE_CONFIG));

  const agent = new ClawAgent({
    tabId: VIRTUAL_TAB_ID,
    logger: new ConsoleLogger(),
    memory: new LarkMemoryProvider(),
    goal: [
      "请完成以下深度研究任务：",
      "1) 访问百度新闻：https://news.baidu.com/",
      "2) 在搜索框中输入 '人工智能' 并确认 (如果首页有搜索框)",
      "3) 从页面或搜索结果中，直接访问第一篇文章",
      "4) 完整浏览该文章页面，提取核心观点并生成一份不少于 200 字的详细摘要",
      "5) 任务完成后输出 finish，并在 description 中汇报你的摘要及在此次任务中发现的『站点操作技巧』"
    ].join("\n"),
    onLog: (msg) => {
      if (msg.includes('Thinking') || msg.includes('Decided') || msg.includes('Executing') || msg.includes('feishu')) {
        console.log(`🧠 ${msg}`);
      }
    },
    onStep: (step) => {
      const state = step.state;
      const action = state?.planner_output?.action;

      if (step.node === 'planner' && action) {
        console.log(`\n🎯 [步骤 ${state?.total_history?.length || '?'}] ${action.type}${action.skill_name ? `(${action.skill_name})` : ''} → ${action.description || ''}`);

        if (state?.task_list && state.task_list.length > 0) {
          console.log('📋 任务清单进度:');
          state.task_list.forEach((t: any) => {
            console.log(`  [${t.status}] ${t.goal}`);
          });
        }
      }

      if (step.node === 'executor' && state?.meta_data?.page_content) {
        const content = state.meta_data.page_content;
        if (content.includes('feishu_operator') || content.includes('Skill Result')) {
          console.log(`\n📄 [执行反馈] ${content.substring(0, 500)}`);
        }
      }
    },
    onFinish: (result) => {
      console.log('\n==========================================');
      console.log('🏆 端到端任务完成！');
      console.log('==========================================');
      console.log(result?.output || JSON.stringify(result, null, 2));
      console.log('------------------------------------------');

      if (agent.getLoggerUrl()) {
        console.log(`📝 飞书运行日志地址: ${agent.getLoggerUrl()}`);
        console.log('------------------------------------------');
      }

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
