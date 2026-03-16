import { Page } from 'puppeteer-core';

/**
 * 飞书文档编辑器 (Writer)
 * 负责文档内容编辑、追加文本、插入图片等
 */
export const FeishuWriter = {
  /**
   * 在当前文档末尾追加文本
   * @param page Puppeteer Page 对象
   * @param text 要追加的文本
   */
  async appendText(page: Page, text: string) {
    console.log(`[Writer] Appending text: "${text.substring(0, 50)}..."`);
    
    try {
      // 1. 聚焦文档编辑器
      // 飞书文档的编辑区域比较复杂，我们先尝试通用的“点击页面中心”策略
      // 后续可以针对性优化，比如查找 canvas 容器
      const viewport = page.viewport();
      const x = (viewport?.width || 1280) / 2;
      const y = (viewport?.height || 800) / 3; // 偏上一点，避开底部
      
      console.log(`[Writer] Focusing editor at (${x}, ${y})...`);
      await page.mouse.click(x, y);
      
      // 等待一下聚焦
      await new Promise(r => setTimeout(r, 1000));
      
      // 2. 模拟键盘输入
      // 注意：这里没有复杂的“定位到末尾”逻辑，通常点击正文区域会自动光标定位
      // 如果要精确控制插入位置，需要更复杂的 DOM 操作或者快捷键 (e.g. Cmd+Down)
      
      // 尝试按 Cmd+Down (Mac) 或 Ctrl+End (Win) 确保光标在最后
      // await page.keyboard.down('Meta');
      // await page.keyboard.press('ArrowDown');
      // await page.keyboard.up('Meta');
      
      console.log(`[Writer] Typing text...`);
      await page.keyboard.type(text, { delay: 50 }); // 打字稍微慢点，模拟人类输入
      
      console.log('✅ [Writer] Text appended successfully.');
      return true;

    } catch (err) {
      console.error('❌ [Writer] Failed to append text:', err);
      return false;
    }
  },

  /**
   * 清空文档内容（慎用！）
   * @param page 
   */
  async clearDocument(page: Page) {
    // TODO: 实现全选删除逻辑
    // Cmd+A -> Delete
  }
};
