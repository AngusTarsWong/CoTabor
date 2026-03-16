import { Page } from 'puppeteer-core';

/**
 * 飞书文档阅读器 (Reader)
 * 负责读取文档内容、表格数据等
 */
export const FeishuReader = {
  /**
   * 读取当前文档的所有文本内容
   * @param page Puppeteer Page 对象
   */
  async readContent(page: Page) {
    console.log('[Reader] Reading document content...');
    
    // 1. 等待文档加载
    // 飞书文档内容通常是 canvas 或者 contenteditable
    // 如果是 canvas，需要 OCR 或者特殊接口 (暂不实现)
    // 如果是 HTML 渲染 (部分文档)，可以直接读取
    
    // 尝试直接提取页面所有文本
    const content = await page.evaluate(() => {
      // 策略 1: 提取所有文本节点
      // 过滤掉不可见的、脚本、样式
      const visibleText = document.body.innerText;
      return visibleText;
    });

    console.log(`[Reader] Extracted ${content.length} characters.`);
    return content;
  },

  /**
   * 读取特定选择器的内容 (如果有)
   */
  async readSelector(page: Page, selector: string) {
    const text = await page.$eval(selector, el => el.textContent);
    return text || '';
  }
};
