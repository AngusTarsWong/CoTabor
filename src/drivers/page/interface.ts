export interface ElementNode {
  id: string;      // Unique identifier assigned by PageAgent
  text?: string;
  role?: string;
  [key: string]: any;
}

export interface IPageDriver {
  /** Initialize the runtime and inject required page scripts. */
  init(tabId: number): Promise<void>;

  // === Perception ===
  /** Extract a semantic DOM snapshot formatted for the LLM. */
  getSemanticDOM(): Promise<string>;

  // === Actions ===
  /** Click an element by its PageAgent-assigned identifier. */
  click(elementId: string): Promise<boolean>;

  /** Type into an element by its PageAgent-assigned identifier. */
  type(elementId: string, text: string): Promise<boolean>;

  /** Scroll the page. */
  scroll(direction: 'up' | 'down'): Promise<boolean>;

  /**
   * Press a key such as `Enter`.
   * @param key Key name
   * @param elementId Optional target element
   */
  press(key: string, elementId?: string): Promise<boolean>;
}
