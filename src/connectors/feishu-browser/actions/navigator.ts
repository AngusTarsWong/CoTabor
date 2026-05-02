import { Page } from 'puppeteer-core';

/**
 * Shared Feishu navigation helpers.
 */
export const FeishuNavigator = {
  /**
   * Navigate to a URL with login detection and post-navigation waiting.
   */
  async goto(page: Page, url: string) {
    // Fast-path when the browser is already on the target surface.
    if (page.url().includes(url)) {
      console.log(`[Navigator] Already on target page: ${url}`);
      return;
    }

    console.log(`[Navigator] Navigating to: ${url}`);
    
    // Attempt the navigation.
    try {
      await page.goto(url, {
        timeout: 60000,
        waitUntil: 'domcontentloaded'
      });
    } catch (e) {
      console.warn(`[Navigator] Navigation timeout or warning: ${e}`);
    }

    // Resume only after handling any login redirect.
    await this.checkLogin(page, url);
  },

  /**
   * Wait for manual login when the browser is redirected to an auth page.
   */
  async checkLogin(page: Page, originalTargetUrl: string) {
    if (page.url().includes('passport') || page.url().includes('login')) {
      console.log('----------------------------------------------------------------');
      console.log('⚠️  LOGIN REQUIRED ⚠️');
      console.log('Please scan the QR code or log in manually in the opened Chrome window.');
      console.log('The script will wait until you are redirected back to the target page.');
      console.log('----------------------------------------------------------------');

      // Use the tail token as a simple redirect target marker.
      const targetToken = originalTargetUrl.split('/').pop() || '';

      await page.waitForFunction((token) => {
        return window.location.href.includes(token);
      }, { timeout: 0 }, targetToken);
      
      console.log('✅ Login detected! Proceeding...');
    }
  }
};
