import { Page } from 'puppeteer-core';

/**
 * Feishu document writing helpers.
 */
export const FeishuWriter = {
  /**
   * Append text near the end of the current document.
   * @param page Puppeteer page instance
   * @param text Text to append
   */
  async appendText(page: Page, text: string) {
    console.log(`[Writer] Appending text: "${text.substring(0, 50)}..."`);
    
    try {
      // Rich-text focus is tricky here, so start with a generic center click.
      const viewport = page.viewport();
      const x = (viewport?.width || 1280) / 2;
      const y = (viewport?.height || 800) / 3; // Bias upward to avoid sticky bottom UI
      
      console.log(`[Writer] Focusing editor at (${x}, ${y})...`);
      await page.mouse.click(x, y);
      
      // Give the editor a moment to receive focus.
      await new Promise(r => setTimeout(r, 1000));
      
      // This helper does not yet enforce an exact insertion point.
      // A future version could use shortcut-based jumps such as Cmd+Down / Ctrl+End.
      // await page.keyboard.down('Meta');
      // await page.keyboard.press('ArrowDown');
      // await page.keyboard.up('Meta');
      
      console.log(`[Writer] Typing text...`);
      await page.keyboard.type(text, { delay: 50 });
      
      console.log('✅ [Writer] Text appended successfully.');
      return true;

    } catch (err) {
      console.error('❌ [Writer] Failed to append text:', err);
      return false;
    }
  },

  /**
   * Clear the document contents. Use with care.
   * @param page 
   */
  async clearDocument(page: Page) {
    // TODO: Implement select-all plus delete.
    // Cmd+A -> Delete
  }
};
