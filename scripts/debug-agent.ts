
import 'dotenv/config';
import puppeteer, { CDPSession } from 'puppeteer';
import { setCdpClient, CdpClient } from '../src/drivers/cdp/index';
import { ClawAgent } from '../src/lib/claw/agent';

// 1. 定义 Puppeteer 适配器
class PuppeteerAdapter implements CdpClient {
  private session: CDPSession;
  private virtualTabId: number;

  constructor(session: CDPSession, virtualTabId: number) {
    this.session = session;
    this.virtualTabId = virtualTabId;
  }

  async attach(tabId: number) {
    if (tabId !== this.virtualTabId) {
      console.warn(`[PuppeteerAdapter] Warning: Request to attach to unknown tabId ${tabId}. Ignoring.`);
      return;
    }
    console.log(`[PuppeteerAdapter] Already attached to virtual tab ${tabId} via Puppeteer.`);
  }

  async detach(tabId: number) {
    if (tabId !== this.virtualTabId) return;
    console.log(`[PuppeteerAdapter] Detaching from virtual tab ${tabId}...`);
    try {
      await this.session.detach();
    } catch (e) {
      console.warn(`[PuppeteerAdapter] Detach failed (might be already closed):`, e);
    }
  }

  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    if (tabId !== this.virtualTabId) {
      throw new Error(`[PuppeteerAdapter] Cannot send command to unknown tabId ${tabId}`);
    }
    // console.log(`[PuppeteerAdapter] Sending CDP command: ${method}`);
    // @ts-ignore: method is a dynamic string, but Puppeteer expects strict types.
    return this.session.send(method as any, params as any) as Promise<Res>;
  }
}

async function run() {
  console.log('--- Starting CoTabor Local Debugger ---');

  // 2. 启动浏览器
  const browser = await puppeteer.launch({
    headless: false, // 有头模式，方便用户观察
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  // Navigate to initial page
  await page.goto('https://www.google.com');

  // 3. 获取 CDP 会话
  const client = await page.createCDPSession();
  const VIRTUAL_TAB_ID = 123456;

  // 4. 注入适配器
  const adapter = new PuppeteerAdapter(client, VIRTUAL_TAB_ID);
  setCdpClient(adapter as any); // Cast to any to bypass strict type check if needed

  // 5. 启动 Agent
  console.log(`[Main] Agent initialized for tab ${VIRTUAL_TAB_ID}. Starting workflow...`);
  
  const agent = new ClawAgent({
    tabId: VIRTUAL_TAB_ID,
    goal: "Go to Google News and read the latest tech news, then summarize it.",
    onLog: (msg) => console.log(`[AgentLog] ${msg}`),
    onStep: (step) => {
        // console.log(`[AgentStep]`, step.node);
    },
    onFinish: (result) => {
      console.log('--- Agent Finished ---');
      console.log(JSON.stringify(result, null, 2));
      // browser.close();
    },
    onError: (err) => {
      console.error('--- Agent Error ---', err);
      // browser.close();
    }
  });

  await agent.start();
}

run().catch(console.error);
