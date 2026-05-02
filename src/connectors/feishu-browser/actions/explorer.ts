import { Page } from 'puppeteer-core';

/**
 * Feishu file explorer helpers.
 */
export interface FeishuFileItem {
  name: string;
  url: string;
  type: 'doc' | 'sheet' | 'folder' | 'base' | 'file' | 'unknown';
}

export const FeishuExplorer = {
  /**
   * Open a folder view.
   * @param page Puppeteer page instance
   * @param folderUrl Target folder URL
   */
  async openFolder(page: Page, folderUrl: string) {
    // Navigate directly. Callers may already have higher-level navigation helpers.
    await page.goto(folderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Folder content usually needs a few seconds to stabilize.
    console.log('[Explorer] Waiting for file list...');
    
    // `role="row"` is the common list-view marker.
    try {
      await page.waitForSelector('[role="row"]', { timeout: 10000 });
    } catch (e) {
      console.warn('[Explorer] Warning: [role="row"] not found immediately, might be empty or loading slowly.');
    }
  },

  /**
   * List files in the current folder view.
   * @param page Puppeteer page instance
   */
  async listFiles(page: Page): Promise<FeishuFileItem[]> {
    console.log('[Explorer] Listing files...');
    
    // Collect candidate rows inside the page context.
    const items = await page.evaluate(() => {
      const results: { name: string, url: string, type: string }[] = [];
      
      // Strategy 1: list view with `role="row"` markers.
      const rows = Array.from(document.querySelectorAll('[role="row"]'));
      
      if (rows.length > 0) {
        rows.forEach(row => {
          const rowEl = row as HTMLElement;
          // The first visible link usually carries the item name.
          const link = rowEl.querySelector('a');
          if (link && link.href) {
             const name = link.innerText.trim() || rowEl.innerText.split('\n')[0].trim();
             // Lightweight type inference from the URL shape.
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

      // Strategy 2: fall back to scanning every link if the list structure changed.
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
             
             // Skip duplicates by URL.
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
