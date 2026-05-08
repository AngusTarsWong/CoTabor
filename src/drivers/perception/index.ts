/**
 * Global singleton facade for browser perception.
 *
 * Usage:
 *   import { perception } from '../../../drivers/perception';
 *   const dom = await perception.extractDOM(tabId);
 *
 * Adapter swap at startup:
 *   import { ProductionAdapter } from '../../../drivers/perception/adapters/production';
 *   perception.setAdapter(new ProductionAdapter(config));
 */

export * from './types';

import { NativeAdapter } from './adapters/native';
import { PerceptionAdapter } from './types';

let _adapter: PerceptionAdapter = new NativeAdapter();

export const perception = {
  /** Swap the backing adapter once at startup. Defaults to `NativeAdapter`. */
  setAdapter(adapter: PerceptionAdapter): void {
    _adapter = adapter;
    console.log(`[Perception] Adapter set: ${adapter.constructor.name}`);
  },

  resetAdapter(): void {
    _adapter = new NativeAdapter();
    console.log("[Perception] Adapter reset: NativeAdapter");
  },

  extractDOM:    (tabId: number)   => _adapter.extractDOM(tabId),
  waitFor:       (p: Parameters<PerceptionAdapter['waitFor']>[0])       => _adapter.waitFor(p),
  locateElement: (p: Parameters<PerceptionAdapter['locateElement']>[0]) => _adapter.locateElement(p),
};
