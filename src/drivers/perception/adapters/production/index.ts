/**
 * ProductionAdapter — 生产环境默认 Adapter
 *
 * extractDOM    → PageAgentAdapter（更完整的 DOM 树）
 * waitFor       → MidsenseAdapter（智能等待）
 * locateElement → MidsenseAdapter（视觉精准定位）
 *
 * 配置方式（agent.ts 启动时）：
 *   perception.setAdapter(new ProductionAdapter({ apiKey: '...', model: 'ui-tars-7b' }));
 */

import { PageAgentAdapter } from '../pageagent';
import { MidsenseAdapter, MidsenseConfig } from '../midsense';
import { PerceptionAdapter, ExtractedDOM, WaitResult, LocateResult } from '../../types';

export class ProductionAdapter implements PerceptionAdapter {
  private pa: PageAgentAdapter;
  private ms: MidsenseAdapter;

  constructor(config: MidsenseConfig) {
    this.pa = new PageAgentAdapter();
    this.ms = new MidsenseAdapter(config);
    console.log(`[ProductionAdapter] Initialized with model: ${config.model ?? 'default'}`);
  }

  extractDOM(tabId: number): Promise<ExtractedDOM> {
    return this.pa.extractDOM(tabId);
  }

  waitFor(params: Parameters<PerceptionAdapter['waitFor']>[0]): Promise<WaitResult> {
    return this.ms.waitFor(params);
  }

  locateElement(params: Parameters<PerceptionAdapter['locateElement']>[0]): Promise<LocateResult | null> {
    return this.ms.locateElement(params);
  }
}
