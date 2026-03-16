
import 'dotenv/config';
import puppeteer, { Page, CDPSession, Browser } from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { FeishuNavigator, FeishuExplorer, FeishuWriter } from '../src/connectors/feishu-browser/actions';
import { AgentGraph } from '../src/core/graph/agent';
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

  // 配置项
  const DEBUG_PORT = 9222;
  
  // 自动获取系统 Chrome 用户数据目录
  const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';
  // const DEFAULT_USER_DATA_DIR = path.join(HOME_DIR, 'Library/Application Support/Google/Chrome');
  const DEFAULT_EXECUTABLE_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  
  // 优先使用环境变量指定的目录，否则使用系统默认目录，最后回退到项目目录
  const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || path.resolve(process.cwd(), '.chrome_debug_profile');
  const EXECUTABLE_PATH = process.env.CHROME_EXECUTABLE_PATH || DEFAULT_EXECUTABLE_PATH;
  const VIRTUAL_TAB_ID = 123456;

  console.log(`[Debug] Target User Data Directory: ${USER_DATA_DIR}`);
  console.log(`[Debug] Target Executable Path: ${EXECUTABLE_PATH}`);

  let browser: Browser;
  let page;

  // 2. 尝试连接或启动浏览器
  try {
    // 尝试连接已运行的 Chrome 实例
    console.log(`[Debug] Attempting to connect to existing Chrome on port ${DEBUG_PORT}...`);
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null
    });
    console.log('✅ Successfully connected to existing Chrome!');
  } catch (e) {
    console.log('⚠️ Could not connect to existing Chrome. Launching dedicated Debug Chrome instance...');
    
    // 如果无法连接，说明 Chrome 没开，或者没开调试端口。
    // 我们尝试启动一个独立的 Chrome 实例，使用项目目录下的 .chrome_debug_profile 作为用户数据目录。
    // 这样不会干扰你日常使用的 Chrome (Default Profile)。
    
    // 确保数据目录存在
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
      console.log(`[Debug] Created user data directory at: ${USER_DATA_DIR}`);
    }

    try {
      browser = await puppeteer.launch({
        headless: false,
        executablePath: EXECUTABLE_PATH, // Mac 默认路径
        userDataDir: USER_DATA_DIR,
        defaultViewport: null,
        args: [
          '--start-maximized',
          `--remote-debugging-port=${DEBUG_PORT}`,
          '--no-first-run', // 不显示首次运行向导
          '--no-default-browser-check' // 不检查是否为默认浏览器
        ]
      });
      console.log(`✅ Launched Dedicated Debug Chrome on port ${DEBUG_PORT}`);
    } catch (launchError: any) {
      console.error('❌ Failed to launch Chrome:', launchError.message);
      process.exit(1);
    }
  }

  // 获取当前所有页面
  const pages = await browser.pages();
  // 优先复用当前活跃的页面，而不是新建
  // 如果是连接到已有浏览器，pages[0] 可能是用户正在看的页面，直接用它会比较方便
  page = pages.find(p => p.url() !== 'about:blank') || pages[0];
  
  if (!page) {
    page = await browser.newPage();
  }
  
  console.log(`[Debug] Attached to page: ${page.url()}`);

  // 3. 获取 CDP 会话 (Agent code commented out)
  // ... 

  // --- 测试：使用封装后的 Actions ---
  
  // 目标飞书文件夹 URL
  const TARGET_FOLDER = 'https://my.feishu.cn/drive/folder/CIynfmaexljFvoddn2CcFy8Dnre';
  
  // 1. 导航到文件夹 (自动处理登录)
  await FeishuNavigator.goto(page, TARGET_FOLDER);
  
  // 等待加载
  await new Promise(r => setTimeout(r, 5000));

  // 2. 读取文件列表 (使用 Explorer)
  const files = await FeishuExplorer.listFiles(page);
  
  console.log('------------------------------------------------');
  console.log(`📂 Found ${files.length} files/items (via FeishuExplorer):`);
  files.forEach((f, i) => console.log(`${i + 1}. [${f.type}] ${f.name} -> ${f.url}`));
  console.log('------------------------------------------------');

  // 3. 找到目标文档并打开 (模拟点击)
  const targetDocName = '测试文档'; // 假设文件夹里有个叫“测试文档”的文件
  // 或者直接找第一个 doc 类型的
  const targetDoc = files.find(f => f.type === 'doc');
  
  if (targetDoc) {
    console.log(`[Debug] Found target document: ${targetDoc.name}, opening...`);
    // 导航到文档
    await FeishuNavigator.goto(page, targetDoc.url);
    
    // 等待文档加载
    await new Promise(r => setTimeout(r, 5000));
    
    // 4. 写入当前时间 (使用 Writer)
    const timeStr = `\n[Auto-Action] Current Time: ${new Date().toLocaleString()}\n`;
    await FeishuWriter.appendText(page, timeStr);
    
  } else {
    console.log('[Debug] No document found in folder to test writing.');
  }

  console.log('[Debug] Test complete using encapsulated Actions.');
  return;


  /*
  // 3. 获取 CDP 会话
  // ... (Agent code commented out for now)
  */
  
  // 3. 获取 CDP 会话
  // 注意：Puppeteer 的 page.createCDPSession() 会为该页面创建一个专用的 CDP 会话
  const client = await page.createCDPSession();
  
  // 4. 注入适配器
  const adapter = new PuppeteerAdapter(client, VIRTUAL_TAB_ID);
  setCdpClient(adapter as any);

  // 5. 启动 Agent
  console.log('[Debug] Initializing Agent...');
  
  // Define agent callbacks
  const onLog = (msg: string) => console.log(`[AgentLog] ${msg}`);
  const onStep = (step: any) => console.log(`[AgentStep] Step: ${JSON.stringify(step.node)}`);
  const onFinish = (result: any) => {
      console.log('--- Agent Finished ---');
      console.log(JSON.stringify(result, null, 2));
  };
  const onError = (err: any) => console.error('--- Agent Error ---', err);

  const agent = new ClawAgent({
    tabId: VIRTUAL_TAB_ID,
    // 修改任务目标，使其更通用
    goal: "Read the content of this Feishu document and summarize it. If it's a long document, scroll to read all content.",
    onLog,
    onStep,
    onFinish,
    onError
  });

  await agent.start();
}

run().catch(console.error);
