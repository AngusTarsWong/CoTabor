declare global {
  var __MOCK_STREAM_LLM__: ((messages: any[], node: string, modelName: string) => Promise<{ content: string; tokenUsage: any }>) | undefined;
  var __MOCK_INVOKE_LLM__: ((messages: any[], node: string, modelName: string) => Promise<{ content: string; tokenUsage: any }>) | undefined;
}

export type MockLLMResponse = string | Record<string, any>;

export interface MockLLMRule {
  nodeMatch?: string; // e.g., 'planner', 'watchdog'
  response: MockLLMResponse;
  times?: number;
}

/**
 * Global LLM Mocking Facility
 * Intercepts calls to `streamLLM` and `invokeLLM` globally.
 */
export class LLMMocker {
  private rules: MockLLMRule[] = [];
  private callCount = 0;

  constructor() {
    this.setupHooks();
  }

  addRule(rule: MockLLMRule) {
    this.rules.push(rule);
  }

  clear() {
    this.rules = [];
    this.callCount = 0;
  }

  destroy() {
    this.clear();
    globalThis.__MOCK_STREAM_LLM__ = undefined;
    globalThis.__MOCK_INVOKE_LLM__ = undefined;
  }

  private setupHooks() {
    const handler = async (messages: any[], node: string, modelName: string) => {
      this.callCount++;
      let matchedRuleIndex = this.rules.findIndex(r => !r.nodeMatch || r.nodeMatch === node);

      if (matchedRuleIndex !== -1) {
        const rule = this.rules[matchedRuleIndex];
        
        if (rule.times !== undefined) {
          rule.times--;
          if (rule.times <= 0) {
            this.rules.splice(matchedRuleIndex, 1);
          }
        }

        const content = typeof rule.response === "string" ? rule.response : JSON.stringify(rule.response);
        
        // Log locally for debugging mock hits
        console.log(`[LLMMocker] Hit mock for node '${node}' at call #${this.callCount}`);

        return {
          content,
          tokenUsage: { prompt: 10, completion: 10, total: 20 },
        };
      }

      throw new Error(`[LLMMocker] Unhandled LLM call for node: ${node}. Messages: ${JSON.stringify(messages).substring(0, 100)}...`);
    };

    globalThis.__MOCK_STREAM_LLM__ = handler;
    globalThis.__MOCK_INVOKE_LLM__ = handler;
  }
}
