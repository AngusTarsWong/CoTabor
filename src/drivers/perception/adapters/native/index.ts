/**
 * Zero-dependency adapter used by default in development and tests.
 *
 * - extractDOM: existing `DOMDriver` implementation
 * - waitFor:    fixed delay (1500ms by default)
 * - locateElement: returns `null` so cortex can trigger replanning
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
