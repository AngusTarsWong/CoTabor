
import { CdpTools } from "../../../drivers/cdp/tools";

/**
 * 自动滚动并读取飞书文档内容
 * 
 * 飞书文档通常是动态加载的（懒加载），如果不滚动到底部，获取到的内容是不完整的。
 * 这个函数会注入一段脚本到页面中，自动滚动并等待内容加载。
 */
export async function scrollAndReadAll(tabId: number, cdpTools: CdpTools): Promise<string> {
  console.log('[FeishuConnector] Starting auto-scroll sequence...');

  // 注入滚动脚本
  // 该脚本在浏览器上下文中执行
  const result = await cdpTools.evaluate<string>(`
    (async function() {
      // 辅助函数：等待指定时间
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // 1. 尝试找到滚动的容器
      // 飞书文档通常在 .document-editor 或者 window 上滚动
      // 这里我们简单起见，优先滚动 window，如果是特定容器可以扩展
      const scrollTarget = window;
      const getScrollHeight = () => document.body.scrollHeight;
      const getScrollTop = () => window.scrollY || document.documentElement.scrollTop;
      
      let lastHeight = getScrollHeight();
      let sameHeightCount = 0;
      const MAX_SAME_COUNT = 3; // 如果高度连续3次没变，认为到底了

      // 2. 循环滚动
      // 限制最大滚动次数防止死循环 (比如无限加载流)
      const MAX_SCROLLS = 50; 
      
      for (let i = 0; i < MAX_SCROLLS; i++) {
        // 向下滚动一屏
        window.scrollTo(0, getScrollHeight());
        
        // 等待加载
        await wait(1000);
        
        const newHeight = getScrollHeight();
        const currentScroll = getScrollTop();
        
        // 检查是否到底
        // 如果高度没变，且滚动条位置接近底部
        if (newHeight === lastHeight) {
          sameHeightCount++;
          if (sameHeightCount >= MAX_SAME_COUNT) {
            console.log('Feishu AutoScroll: Reached bottom.');
            break;
          }
        } else {
          sameHeightCount = 0;
          lastHeight = newHeight;
        }
      }

      // 3. 提取内容
      // 滚动完成后，DOM 应该已经完整加载
      // 尝试提取主要内容区域，如果找不到则提取 body
      const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.body;
      return editor.innerText;
    })()
  `);

  console.log('[FeishuConnector] Auto-scroll completed. Content length:', result ? result.length : 0);
  return result || "";
}
