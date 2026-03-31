import { IVisionDriver, VisionActionRequest, VisionActionResult, VisionQueryRequest, VisionQueryResult } from '../interface';

export class MidsceneVisionDriver implements IVisionDriver {
  private agent: any = null;

  async init(config: any): Promise<void> {
    // 动态初始化：根据运行环境选择不同的 Midscene Agent
    if (config?.type === 'puppeteer' && config.page) {
      const { PuppeteerAgent } = await import('@midscene/web/puppeteer');
      this.agent = new PuppeteerAgent(config.page);
      console.log('[VisionDriver] Initialized Midscene PuppeteerAgent');
    } else if (config?.type === 'chrome-extension') {
      const { ChromeExtensionProxyPage, ChromeExtensionProxyPageAgent } = await import('@midscene/web/chrome-extension');
      // 传入 false 表示不强制在同一 Tab 导航
      const proxyPage = new ChromeExtensionProxyPage(false);
      if (config.tabId) {
        // 强制注入 tabId，避免总是去取 currentActiveTab
        (proxyPage as any).activeTabId = config.tabId;
      }
      this.agent = new ChromeExtensionProxyPageAgent(proxyPage);
      console.log('[VisionDriver] Initialized Midscene ChromeExtensionProxyPageAgent');
    } else {
      throw new Error('[VisionDriver] Invalid init config for Midscene');
    }
  }

  async executeAction(req: VisionActionRequest): Promise<VisionActionResult> {
    if (!this.agent) {
      return { success: false, error: 'MidsceneVisionDriver is not initialized' };
    }

    try {
      // 组装上下文与指令
      let prompt = req.instruction;
      if (req.context) {
        prompt = `上下文信息: ${JSON.stringify(req.context)}\n指令: ${prompt}`;
      }

      await this.agent.aiAction(prompt);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }

  async queryState(req: VisionQueryRequest): Promise<VisionQueryResult> {
    if (!this.agent) {
      return { answer: '', error: 'MidsceneVisionDriver is not initialized' };
    }

    try {
      const result = await this.agent.aiQuery(req.question);
      // aiQuery 返回的是一个任意类型，根据问题可能返回 boolean 或 string 或 array
      return { answer: typeof result === 'string' ? result : JSON.stringify(result) };
    } catch (error: any) {
      return { answer: '', error: error.message || String(error) };
    }
  }

  async destroy(): Promise<void> {
    if (this.agent) {
      await this.agent.destroy();
      this.agent = null;
    }
  }
}
