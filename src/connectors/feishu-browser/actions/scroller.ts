
import { CdpTools } from "../../../drivers/cdp/tools";

/**
 * Auto-scroll and read a Feishu document.
 *
 * Feishu docs usually lazy-load content, so reading without scrolling first
 * often yields an incomplete snapshot.
 */
export async function scrollAndReadAll(tabId: number, cdpTools: CdpTools): Promise<string> {
  console.log('[FeishuConnector] Starting auto-scroll sequence...');

  // Inject the scrolling script into the page context.
  const result = await cdpTools.evaluate<string>(`
    (async function() {
      // Helper for timed waits between scroll attempts.
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // Prefer the actual scroll container. This simplified version uses window.
      const scrollTarget = window;
      const getScrollHeight = () => document.body.scrollHeight;
      const getScrollTop = () => window.scrollY || document.documentElement.scrollTop;
      
      let lastHeight = getScrollHeight();
      let sameHeightCount = 0;
      const MAX_SAME_COUNT = 3;

      // Cap the loop to avoid infinite scrolling on unstable pages.
      const MAX_SCROLLS = 50; 
      
      for (let i = 0; i < MAX_SCROLLS; i++) {
        window.scrollTo(0, getScrollHeight());
        
        await wait(1000);
        
        const newHeight = getScrollHeight();
        const currentScroll = getScrollTop();
        
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

      // Extract the most likely editor region once scrolling finishes.
      const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.body;
      return editor.innerText;
    })()
  `);

  console.log('[FeishuConnector] Auto-scroll completed. Content length:', result ? result.length : 0);
  return result || "";
}
