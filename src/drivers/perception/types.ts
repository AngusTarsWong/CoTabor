/**
 * `PerceptionAdapter` defines the browser-perception contract.
 *
 * Responsibility split in the A2A pipeline:
 *   Planner  -> extractDOM
 *   Executor -> waitFor
 *   Cortex   -> locateElement
 *   Watchdog -> uses its own LLM reasoning, not this interface
 *
 * Extend by adding methods only. Avoid breaking existing signatures.
 */

export interface DOMElement {
  index: number;
  tagName: string;
  role: string | null;
  text: string;
  placeholder: string | null;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ExtractedDOM {
  elements: DOMElement[];
  pageTitle: string;
  pageUrl: string;
  visibleText: string;
  simplifiedText: string; // Formatted text sent directly to the LLM
}

export interface LocateResult {
  x: number;
  y: number;
  description?: string;
}

export interface WaitResult {
  met: boolean;
  reason: string;
  elapsedMs: number;
}

export interface PerceptionAdapter {
  /** DOM extraction used by the planner. */
  extractDOM(tabId: number): Promise<ExtractedDOM>;

  /** Condition-aware waiting used by the executor instead of fixed sleeps. */
  waitFor(params: {
    tabId: number;
    condition: string;
    timeoutMs?: number;
  }): Promise<WaitResult>;

  /** Visual element lookup used by cortex. Returns `null` when not found. */
  locateElement(params: {
    screenshot: string;   // base64
    description: string;  // Natural-language description such as "blue submit button"
    tabId?: number;
  }): Promise<LocateResult | null>;
}
