/**
 * Default production adapter.
 *
 * extractDOM    -> PageAgentAdapter for richer DOM trees
 * waitFor       -> MidsenseAdapter for condition-aware waiting
 * locateElement -> MidsenseAdapter for visual targeting
 *
 * Startup usage:
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
