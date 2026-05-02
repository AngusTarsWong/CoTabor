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
   * Initialize the vision driver.
   * Typically receives a page object such as a Puppeteer page or CDP client.
   */
  init(pageOrClient: any): Promise<void>;

  /**
   * Execute a visual action such as clicking or typing.
   */
  executeAction(req: VisionActionRequest): Promise<VisionActionResult>;

  /**
   * Query visual state, such as whether an element or page condition exists.
   */
  queryState(req: VisionQueryRequest): Promise<VisionQueryResult>;

  /**
   * Release driver resources.
   */
  destroy(): Promise<void>;
}
