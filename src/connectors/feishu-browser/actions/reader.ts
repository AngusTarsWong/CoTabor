import { Page } from 'puppeteer-core';

/**
 * Feishu document reading helpers.
 */
export const FeishuReader = {
  /**
   * Read all visible text from the current document.
   * @param page Puppeteer page instance
   */
  async readContent(page: Page) {
    console.log('[Reader] Reading document content...');
    
    // Feishu docs may render through canvas or contenteditable surfaces.
    // This helper currently relies on direct HTML text extraction only.
    const content = await page.evaluate(() => {
      // `innerText` is a coarse but effective fallback here.
      const visibleText = document.body.innerText;
      return visibleText;
    });

    console.log(`[Reader] Extracted ${content.length} characters.`);
    return content;
  },

  /**
   * Read text from a specific selector when available.
   */
  async readSelector(page: Page, selector: string) {
    const text = await page.$eval(selector, el => el.textContent);
    return text || '';
  }
};
