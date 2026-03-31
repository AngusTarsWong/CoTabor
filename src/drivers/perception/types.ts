/**
 * PerceptionAdapter — 感知层接口契约
 *
 * 职责分配（A2A 模式）：
 *   Planner   → extractDOM      感知页面结构
 *   Executor  → waitFor         等待页面稳定
 *   Cortex    → locateElement   视觉定位失败元素
 *   Watchdog  → 自己的 LLM（判断成功 + 摘要 + 提取数据，不经过此接口）
 *
 * 只增不改：新增能力只添加方法，不修改已有签名。
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
  simplifiedText: string; // 直接传给 LLM 的格式化字符串
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
  /** DOM 提取 — Planner 调用 */
  extractDOM(tabId: number): Promise<ExtractedDOM>;

  /** 智能等待 — Executor 调用，替代固定 setTimeout */
  waitFor(params: {
    tabId: number;
    condition: string;
    timeoutMs?: number;
  }): Promise<WaitResult>;

  /** 视觉元素定位 — Cortex 调用，找不到返回 null */
  locateElement(params: {
    screenshot: string;   // base64
    description: string;  // 自然语言：「蓝色的提交按钮」
    tabId?: number;
  }): Promise<LocateResult | null>;
}
