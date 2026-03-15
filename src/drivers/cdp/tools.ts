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
}
