export interface VisionActionRequest {
  instruction: string;
  context?: any;
}

export interface VisionActionResult {
  success: boolean;
  error?: string;
  details?: any;
}

export interface VisionQueryRequest {
  question: string;
}

export interface VisionQueryResult {
  answer: string;
  error?: string;
}

export interface IVisionDriver {
  /**
   * 初始化视觉驱动（通常需要传入页面实例，如 puppeteer 的 page 或 CDP 的 client）
   */
  init(pageOrClient: any): Promise<void>;

  /**
   * 执行视觉动作（例如点击、输入等）
   */
  executeAction(req: VisionActionRequest): Promise<VisionActionResult>;

  /**
   * 视觉断言/查询（检查页面上是否存在某个元素或状态）
   */
  queryState(req: VisionQueryRequest): Promise<VisionQueryResult>;

  /**
   * 清理资源
   */
  destroy(): Promise<void>;
}
