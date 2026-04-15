import 'dotenv/config';
import puppeteer, { CDPSession } from 'puppeteer-core';
import { setCdpClient, CdpClient } from '../src/drivers/cdp/index';
import { getVisionDriver } from '../src/drivers/vision/index';
import { ClawAgent } from '../src/lib/claw/agent';
import { LarkLogger } from '../src/shared/utils/logger/lark-logger';
import { LarkMemoryProvider } from '../src/shared/utils/memory/lark-memory';
import { perception } from '../src/drivers/perception/index';
import { ProductionAdapter } from '../src/drivers/perception/adapters/production';
import { ENV } from '../src/shared/constants/env';

class PuppeteerAdapter implements CdpClient {
  constructor(private session: CDPSession) {}
  async attach() {}
  async detach() {}
  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    return this.session.send(method as any, params as any) as Promise<Res>;
  }
}

async function run() {
  const EXECUTABLE_PATH = process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({ headless: true, executablePath: EXECUTABLE_PATH });
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  const VIRTUAL_TAB_ID = 12345;
  
  setCdpClient(new PuppeteerAdapter(client) as any);
  await getVisionDriver().init({ type: 'puppeteer', page } as any);
  perception.setAdapter(new ProductionAdapter(ENV.MIDSENSE_CONFIG));

  const agent = new ClawAgent({
    tabId: VIRTUAL_TAB_ID,
    logger: new LarkLogger(),
    memory: new LarkMemoryProvider(),
    goal: "Navigate to https://example.com, and tell me the title of the page.",
    onLog: (msg) => console.log(`🧠 ${msg}`)
  });

  await agent.start();
}

run().catch(console.error);
