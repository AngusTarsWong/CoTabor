import { IVisionDriver, VisionActionRequest, VisionActionResult, VisionQueryRequest, VisionQueryResult } from '../interface';

export class MidsceneVisionDriver implements IVisionDriver {
  private agent: any = null;

  async init(config: any): Promise<void> {
    // Select the correct Midscene agent based on the runtime environment.
    if (config?.type === 'puppeteer' && config.page) {
      const { PuppeteerAgent } = await import('@midscene/web/puppeteer');
      this.agent = new PuppeteerAgent(config.page);
      console.log('[VisionDriver] Initialized Midscene PuppeteerAgent');
    } else if (config?.type === 'chrome-extension') {
      const { ChromeExtensionProxyPage, ChromeExtensionProxyPageAgent } = await import('@midscene/web/chrome-extension');
      // `false` means navigation does not have to stay in the same tab.
      const proxyPage = new ChromeExtensionProxyPage(false);
      if (config.tabId) {
        // Pin the active tab to avoid falling back to `currentActiveTab`.
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
      // Build the final prompt by combining optional context with the instruction.
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
      // `aiQuery` can return multiple shapes depending on the question.
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
