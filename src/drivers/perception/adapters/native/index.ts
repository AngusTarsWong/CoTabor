/**
 * NativeAdapter — 零依赖实现，开发/测试环境默认使用
 *
 * - extractDOM: 现有 DOMDriver 逻辑（已在 dom/index.ts 中优化）
 * - waitFor:    固定延迟（1500ms）
 * - locateElement: 返回 null（Cortex 将直接上报 NEEDS_REPLAN）
 */

import { DOMDriver } from '../../../dom/index';
import { PerceptionAdapter, ExtractedDOM, WaitResult, LocateResult } from '../../types';

export class NativeAdapter implements PerceptionAdapter {
  async extractDOM(tabId: number): Promise<ExtractedDOM> {
    const driver = new DOMDriver(tabId);
    return driver.extractDOM();
  }

  async waitFor(params: {
    tabId: number;
    condition: string;
    timeoutMs?: number;
  }): Promise<WaitResult> {
    const ms = params.timeoutMs ?? 1500;
    await new Promise(r => setTimeout(r, ms));
    return { met: true, reason: 'Fixed wait (NativeAdapter)', elapsedMs: ms };
  }

  async locateElement(_params: {
    screenshot: string;
    description: string;
    tabId?: number;
  }): Promise<LocateResult | null> {
    return null;
  }
}
