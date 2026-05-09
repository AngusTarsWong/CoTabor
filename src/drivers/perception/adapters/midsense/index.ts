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
import { buildMidsceneModelConfig } from '../../../midscene/model-config';

export interface MidsenseConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string; // Defaults to ui-tars-7b
}

export class MidsenseAdapter extends NativeAdapter {
  requiresExternalScreenshotForLocate = false;

  constructor(private config: MidsenseConfig) {
    super();
  }

  private buildAgent(tabId: number): ChromeExtensionProxyPageAgent {
    const page = new ChromeExtensionProxyPage(false);
    // Bypass setActiveTabId() — that method calls chrome.tabs.update({ active: true })
    // which steals tab focus. Setting the private property directly is the safe pattern
    // used by MidsceneVisionDriver.
    (page as any).activeTabId = tabId;
    return new ChromeExtensionProxyPageAgent(page, {
      modelConfig: buildMidsceneModelConfig(this.config),
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
    // aiWaitFor returns Promise<void> — success = resolves, failure = throws
    try {
      await (agent as any).aiWaitFor(params.condition, {
        timeoutMs: params.timeoutMs ?? 8000,
      });
      return { met: true, reason: 'Condition met', elapsedMs: Date.now() - start };
    } catch (e: any) {
      return { met: false, reason: e.message || String(e), elapsedMs: Date.now() - start };
    }
  }

  async locateElement(params: {
    screenshot: string;
    description: string;
    tabId?: number;
  }): Promise<LocateResult | null> {
    console.log(`[MidsenseAdapter] locateElement: "${params.description}"`);

    if (!params.tabId) return null;

    const agent = this.buildAgent(params.tabId);
    // aiLocate captures its own screenshot internally; the passed screenshot is not used
    const result = await (agent as any).aiLocate(params.description);

    if (!result?.center) {
      console.warn('[MidsenseAdapter] locateElement returned no result');
      return null;
    }

    return {
      x: result.center[0],
      y: result.center[1],
      description: params.description,
    };
  }
}
