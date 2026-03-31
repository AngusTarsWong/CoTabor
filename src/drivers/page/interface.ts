export interface ElementNode {
  id: string;      // 阿里 PageAgent 分配的唯一标识符
  text?: string;
  role?: string;
  [key: string]: any;
}

export interface IPageDriver {
  /** 初始化运行环境 (注入核心 JS 脚本) */
  init(tabId: number): Promise<void>;

  // === 感知层 (Perception) ===
  /** 
   * 提取页面语义化 DOM 
   * @returns 供 LLM 阅读的精简文本
   */
  getSemanticDOM(): Promise<string>;

  // === 执行层 (Action) ===
  /**
   * 基于阿里分配的 ID 进行点击 (调用其内部的 dispatchEvent 逻辑)
   */
  click(elementId: string): Promise<boolean>;

  /**
   * 基于阿里分配的 ID 进行输入 (调用其内部的 value setter + dispatchEvent 逻辑)
   */
  type(elementId: string, text: string): Promise<boolean>;

  /**
   * 页面滚动
   */
  scroll(direction: 'up' | 'down'): Promise<boolean>;
}
