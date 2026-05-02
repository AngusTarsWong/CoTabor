/**
 * Higher-level helpers built on top of the CDP transport.
 */
import { cdpClient } from './index';

export class CdpTools {
  private tabId: number;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  /** Capture a screenshot and return the Base64 payload. */
  async captureScreenshot(quality: number = 80): Promise<string> {
    const result = await cdpClient.send(this.tabId, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality,
    });
    return result.data;
  }

  /**
   * Evaluate JavaScript in the page context.
   * This is the main primitive used by perception adapters for DOM analysis.
   */
  async evaluate<T = any>(expression: string): Promise<T> {
    const result = await cdpClient.send(this.tabId, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`Script execution failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value as T;
  }

  /** Read the current viewport size and scroll position. */
  async getLayout() {
    return this.evaluate<{ width: number; height: number; scrollX: number; scrollY: number }>(`
      ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      })
    `);
  }

  /** Navigate the current tab to a URL. */
  async navigate(url: string): Promise<void> {
    await cdpClient.send(this.tabId, 'Page.navigate', { url });
  }

  /** Dispatch a low-level mouse click. */
  async mouseClick(x: number, y: number): Promise<void> {
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await new Promise(r => setTimeout(r, 50));
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
  }

  /** Dispatch low-level typing events. */
  async keyboardType(text: string): Promise<void> {
    for (const char of text) {
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: char
      });
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /** Insert text into a selector or the active element via `Runtime.evaluate`. */
  async type(selector: string, text: string): Promise<void> {
    await this.evaluate(`
      (async () => {
        const el = document.querySelector('${selector}') || document.activeElement;
        if (el) {
          if (el.value !== undefined) {
            el.value += ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
             document.execCommand('insertText', false, ${JSON.stringify(text)});
          }
        }
      })()
    `);
  }
}
