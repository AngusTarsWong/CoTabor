import { Page } from 'puppeteer-core';

/**
 * 飞书资源管理器 (Explorer)
 * 负责文件列表、文件夹导航、搜索等操作
 */
export interface FeishuFileItem {
  name: string;
  url: string;
  type: 'doc' | 'sheet' | 'folder' | 'base' | 'file' | 'unknown';
}

export const FeishuExplorer = {
  /**
   * 打开指定文件夹
   * @param page Puppeteer Page 对象
   * @param folderUrl 目标文件夹 URL
   */
  async openFolder(page: Page, folderUrl: string) {
    // 1. 导航到页面
    // 假设已经使用了 Navigator 模块
    // 如果没有，直接 page.goto
    await page.goto(folderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // 2. 等待文件列表加载
    // 飞书文件夹加载通常需要几秒钟
    console.log('[Explorer] Waiting for file list...');
    
    // 尝试等待 role="row" 或其他列表特征
    try {
      await page.waitForSelector('[role="row"]', { timeout: 10000 });
    } catch (e) {
      console.warn('[Explorer] Warning: [role="row"] not found immediately, might be empty or loading slowly.');
    }
  },

  /**
   * 获取当前文件夹下的所有文件列表
   * @param page Puppeteer Page 对象
   */
  async listFiles(page: Page): Promise<FeishuFileItem[]> {
    console.log('[Explorer] Listing files...');
    
    // 使用 evaluate 在浏览器上下文中执行
    const items = await page.evaluate(() => {
      const results: { name: string, url: string, type: string }[] = [];
      
      // 策略 1: 查找所有 role="row" 的元素 (列表视图)
      const rows = Array.from(document.querySelectorAll('[role="row"]'));
      
      if (rows.length > 0) {
        rows.forEach(row => {
          const rowEl = row as HTMLElement;
          // 通常第一行是文件名，且包含链接
          const link = rowEl.querySelector('a');
          if (link && link.href) {
             const name = link.innerText.trim() || rowEl.innerText.split('\n')[0].trim();
             // 简单的类型推断
             let type = 'unknown';
             if (link.href.includes('/docx/')) type = 'doc';
             else if (link.href.includes('/sheets/')) type = 'sheet';
             else if (link.href.includes('/base/')) type = 'base';
             else if (link.href.includes('/file/')) type = 'file';
             else if (link.href.includes('/drive/folder/')) type = 'folder';

             if (name && name !== 'Name' && name !== '名称') {
               results.push({ name, url: link.href, type });
             }
          }
        });
        return results;
      }

      // 策略 2: 兜底逻辑，直接扫描所有链接
      // 如果不是列表视图（可能是网格视图），或者 DOM 结构变了
      const links = Array.from(document.querySelectorAll('a'));
      links.forEach(a => {
        const href = a.href;
        if (href.includes('/docx/') || href.includes('/sheets/') || href.includes('/base/') || href.includes('/file/') || href.includes('/drive/folder/')) {
          const name = a.innerText.trim();
          if (name.length > 0) {
             let type = 'unknown';
             if (href.includes('/docx/')) type = 'doc';
             else if (href.includes('/sheets/')) type = 'sheet';
             else if (href.includes('/base/')) type = 'base';
             else if (href.includes('/file/')) type = 'file';
             else if (href.includes('/drive/folder/')) type = 'folder';
             
             // 去重逻辑简单处理：如果不包含，则添加
             if (!results.some(r => r.url === href)) {
                results.push({ name, url: href, type });
             }
          }
        }
      });
      
      return results;
    });

    return items as FeishuFileItem[];
  }
};
