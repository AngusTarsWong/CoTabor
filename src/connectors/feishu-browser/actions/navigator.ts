import { Page } from 'puppeteer-core';

/**
 * 飞书导航器 (Navigator)
 * 负责页面跳转、登录检测、环境检查等通用操作
 */
export const FeishuNavigator = {
  /**
   * 智能跳转到指定 URL
   * 包含登录检测和等待逻辑
   */
  async goto(page: Page, url: string) {
    // 1. 如果已经在目标页面，直接返回
    if (page.url().includes(url)) {
      console.log(`[Navigator] Already on target page: ${url}`);
      return;
    }

    console.log(`[Navigator] Navigating to: ${url}`);
    
    // 2. 跳转页面
    try {
      await page.goto(url, {
        timeout: 60000,
        waitUntil: 'domcontentloaded'
      });
    } catch (e) {
      console.warn(`[Navigator] Navigation timeout or warning: ${e}`);
    }

    // 3. 检查是否需要登录
    await this.checkLogin(page, url);
  },

  /**
   * 检查是否跳转到了登录页，如果是则等待用户登录
   */
  async checkLogin(page: Page, originalTargetUrl: string) {
    if (page.url().includes('passport') || page.url().includes('login')) {
      console.log('----------------------------------------------------------------');
      console.log('⚠️  LOGIN REQUIRED ⚠️');
      console.log('Please scan the QR code or log in manually in the opened Chrome window.');
      console.log('The script will wait until you are redirected back to the target page.');
      console.log('----------------------------------------------------------------');

      // 提取 URL 关键部分作为特征 (例如 docx id 或者 folder token)
      // 简单起见，这里假设 originalTargetUrl 是唯一的
      // 更健壮的方式是提取 path 或 query
      const targetToken = originalTargetUrl.split('/').pop() || '';

      await page.waitForFunction((token) => {
        return window.location.href.includes(token);
      }, { timeout: 0 }, targetToken);
      
      console.log('✅ Login detected! Proceeding...');
    }
  }
};
