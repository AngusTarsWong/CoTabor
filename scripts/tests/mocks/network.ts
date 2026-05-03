export interface NetworkMockRule {
  urlPattern: RegExp | string;
  responseBody: any;
  status?: number;
  contentType?: string;
  times?: number;
}

/**
 * Intercepts global fetch calls (useful for mocking MCP tools or REST API endpoints)
 */
export class NetworkMocker {
  private originalFetch = globalThis.fetch;
  private rules: NetworkMockRule[] = [];

  constructor() {
    this.setupHook();
  }

  addRule(rule: NetworkMockRule) {
    this.rules.push(rule);
  }

  clear() {
    this.rules = [];
  }

  destroy() {
    this.clear();
    globalThis.fetch = this.originalFetch;
  }

  private setupHook() {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      
      const matchedIndex = this.rules.findIndex(r => 
        typeof r.urlPattern === 'string' ? url.includes(r.urlPattern) : r.urlPattern.test(url)
      );

      if (matchedIndex !== -1) {
        const rule = this.rules[matchedIndex];
        if (rule.times !== undefined) {
          rule.times--;
          if (rule.times <= 0) {
            this.rules.splice(matchedIndex, 1);
          }
        }

        const body = typeof rule.responseBody === 'string' ? rule.responseBody : JSON.stringify(rule.responseBody);
        return new Response(body, {
          status: rule.status ?? 200,
          headers: { "Content-Type": rule.contentType ?? "application/json" }
        });
      }

      // Fallback
      return this.originalFetch(input, init);
    };
  }
}
