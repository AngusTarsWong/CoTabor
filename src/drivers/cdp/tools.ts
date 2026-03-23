/**
 * CDP 进阶工具集
 * 提供截图、脚本执行等常用高级能力
 */
import { cdpClient } from './index';

export class CdpTools {
  private tabId: number;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  /**
   * 获取页面截图 (Base64)
   * 对应 CDP: Page.captureScreenshot
   */
  async captureScreenshot(quality: number = 80): Promise<string> {
    const result = await cdpClient.send(this.tabId, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality,
    });
    return result.data; // 返回 base64 字符串
  }

  /**
   * 在页面上下文中执行 JavaScript 脚本
   * 对应 CDP: Runtime.evaluate
   * 这是 midsense 实现复杂 DOM 分析的核心方式
   */
  async evaluate<T = any>(expression: string): Promise<T> {
    const result = await cdpClient.send(this.tabId, 'Runtime.evaluate', {
      expression,
      returnByValue: true, // 直接返回结果值，而不是引用
      awaitPromise: true,  // 如果是 Promise，等待 resolve
    });

    if (result.exceptionDetails) {
      throw new Error(`Script execution failed: ${result.exceptionDetails.text}`);
    }

    return result.result.value as T;
  }

  /**
   * 获取页面布局信息 (极简版)
   * 通过注入脚本获取视口大小和滚动位置
   */
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

  /**
   * 导航到指定 URL
   */
  async navigate(url: string): Promise<void> {
    await cdpClient.send(this.tabId, 'Page.navigate', { url });
  }

  /**
   * 模拟鼠标点击 (物理级)
   */
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

  /**
   * 模拟键盘输入 (物理级)
   */
  async keyboardType(text: string): Promise<void> {
    for (const char of text) {
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: char
      });
      await new Promise(r => setTimeout(r, 20)); // 打字间隔
    }
  }

  /**
   * 在指定元素中输入文本 (简化版，通过 evaluate 实现)
   */
  async type(selector: string, text: string): Promise<void> {
    await this.evaluate(`
      (async () => {
        const el = document.querySelector('${selector}') || document.activeElement;
        if (el) {
          // 如果是 input 或 textarea
          if (el.value !== undefined) {
            el.value += ${JSON.stringify(text)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
             // 对于 contenteditable 元素
             document.execCommand('insertText', false, ${JSON.stringify(text)});
          }
        }
      })()
    `);
  }
}
