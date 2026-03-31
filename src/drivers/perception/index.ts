/**
 * 全局感知层单例
 *
 * 使用方式（与 skillRegistry 一致）：
 *   import { perception } from '../../../drivers/perception';
 *   const dom = await perception.extractDOM(tabId);
 *
 * 切换底层实现（agent.ts 启动时调用一次）：
 *   import { ProductionAdapter } from '../../../drivers/perception/adapters/production';
 *   perception.setAdapter(new ProductionAdapter(config));
 */

export * from './types';

import { NativeAdapter } from './adapters/native';
import { PerceptionAdapter } from './types';

let _adapter: PerceptionAdapter = new NativeAdapter();

export const perception = {
  /** 启动时调用一次，切换底层实现。未调用时使用 NativeAdapter（零依赖）。 */
  setAdapter(adapter: PerceptionAdapter): void {
    _adapter = adapter;
    console.log(`[Perception] Adapter set: ${adapter.constructor.name}`);
  },

  extractDOM:    (tabId: number)   => _adapter.extractDOM(tabId),
  waitFor:       (p: Parameters<PerceptionAdapter['waitFor']>[0])       => _adapter.waitFor(p),
  locateElement: (p: Parameters<PerceptionAdapter['locateElement']>[0]) => _adapter.locateElement(p),
};
