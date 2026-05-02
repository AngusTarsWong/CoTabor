/**
 * Midsense adapter powered by `@midscene/web`.
 *
 * Dependency: `npm install @midscene/web`
 *
 * Responsibilities:
 *   waitFor       -> ChromeExtensionProxyPageAgent.aiWaitFor()
 *   locateElement -> ChromeExtensionProxyPageAgent.aiLocate()
 *
 * DOM extraction is handled by `PageAgentAdapter`, not here.
 */

import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import { NativeAdapter } from '../native';
import { WaitResult, LocateResult } from '../../types';

export interface MidsenseConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string; // Defaults to ui-tars-7b
}

export class MidsenseAdapter extends NativeAdapter {
  constructor(private config: MidsenseConfig) {
    super();
  }

  private buildAgent(tabId: number): ChromeExtensionProxyPageAgent {
    const page = new ChromeExtensionProxyPage(false);
    page.setActiveTabId(tabId);
    return new ChromeExtensionProxyPageAgent(page, {
      aiActionContext: '',
      ...(this.config.model ? { model: this.config.model } : {}),
    } as any);
  }

  async waitFor(params: {
    tabId: number;
    condition: string;
    timeoutMs?: number;
  }): Promise<WaitResult> {
    const start = Date.now();
    console.log(`[MidsenseAdapter] waitFor: "${params.condition}"`);

    const agent = this.buildAgent(params.tabId);
    const result = await (agent as any).aiWaitFor(params.condition, {
      timeoutMs: params.timeoutMs ?? 8000,
    });

    return {
      met: result?.pass ?? true,
      reason: result?.thought ?? 'Midsense waitFor completed',
      elapsedMs: Date.now() - start,
    };
  }

  async locateElement(params: {
    screenshot: string;
    description: string;
    tabId?: number;
  }): Promise<LocateResult | null> {
    console.log(`[MidsenseAdapter] locateElement: "${params.description}"`);

    if (!params.tabId) return null;

    const agent = this.buildAgent(params.tabId);
    const result = await (agent as any).aiLocate(params.description);

    if (!result?.center) {
      console.warn('[MidsenseAdapter] locateElement returned no result');
      return null;
    }

    return {
      x: result.center[0],
      y: result.center[1],
      description: result.id || params.description,
    };
  }
}
