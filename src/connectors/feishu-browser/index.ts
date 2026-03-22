
import { CdpTools } from "../../drivers/cdp/tools";

/**
 * 飞书文档连接器
 * 
 * 这是一个高级模块，用于处理飞书文档的特殊交互逻辑。
 * 它封装了“如何读取飞书文档”的知识，例如：
 * 1. 自动滚动懒加载内容
 * 2. 识别文档结构（标题、目录等）
 * 3. 处理多维表格（未来扩展）
 */

// 简单的滚动脚本实现，后续可以替换为更复杂的逻辑
async function autoScrollAndRead(cdpTools: CdpTools): Promise<string> {
  console.log('[FeishuConnector] Starting auto-scroll sequence...');
  
  // 在浏览器中执行滚动脚本
  const content = await cdpTools.evaluate<string>(`
    (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // 尝试找到主要滚动容器，通常是 window 或者 .document-editor
      // 这里简化处理，直接滚动 window
      let lastHeight = document.body.scrollHeight;
      let noChangeCount = 0;
      
      // 最大滚动尝试次数，防止死循环
      for(let i=0; i<30; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await wait(800); // 等待内容加载
        
        const newHeight = document.body.scrollHeight;
        if(newHeight === lastHeight) {
          noChangeCount++;
          if(noChangeCount >= 3) break; // 连续3次高度没变，认为到底了
        } else {
          noChangeCount = 0;
          lastHeight = newHeight;
        }
      }
      
      // 提取内容
      // 优先提取编辑器区域，如果找不到则提取 body
      const editor = document.querySelector('.document-editor') || 
                     document.querySelector('.bear-editor') || 
                     document.body;
                     
      return editor.innerText;
    })()
  `);
  
  return content || "";
}

export const FeishuBrowserConnector = {
  /**
   * 判断当前 URL 是否是飞书文档
   */
  isFeishuUrl(url: string): boolean {
    if (!url) return false;
    return url.includes('feishu.cn/docs') || url.includes('feishu.cn/docx') || url.includes('larksuite.com/docs');
  },

  /**
   * 读取文档内容（包含自动滚动逻辑）
   */
  async readDocument(tabId: number): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    
    // 1. 获取文档标题
    const title = await cdpTools.evaluate<string>('document.title');
    
    // 2. 执行自动滚动并获取全文
    const content = await autoScrollAndRead(cdpTools);
    
    // 3. 组装返回结果
    return `[Feishu Doc: ${title}]\n\n${content}`;
  },

  /**
   * 写入新文档（CDP 自动化方式）
   */
  async writeDocument(tabId: number, title: string, content: string): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    
    console.log('[FeishuConnector] Starting document creation via CDP...');

    // 1. Navigate to Feishu new doc creation URL
    await cdpTools.navigate("https://feishu.cn/space/home");
    // Wait for the space home to load
    await new Promise(r => setTimeout(r, 8000)); 

    // Feishu UI is highly dynamic. Instead of clicking UI buttons which might fail if DOM changes,
    // let's try direct navigation to the create endpoint if possible.
    // However, if we must click:
    const docUrl = await cdpTools.evaluate<string>(`
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        
        // 1. Look for the "New" (新建) button
        // Let's try multiple possible selectors for Feishu's complex UI
        let newBtn = document.querySelector('[data-test-id="space-home-create-btn"]') || 
                     document.querySelector('.create-dropdown-trigger');
                     
        if (!newBtn) {
            // Fallback: search by text content
            const buttons = Array.from(document.querySelectorAll('button, div'));
            newBtn = buttons.find(b => b.textContent && b.textContent.trim() === '新建' && b.getBoundingClientRect().width > 0);
        }
        
        if (!newBtn) {
           // As a last resort, just return a shortcut URL to navigate to directly
           return "SHORTCUT_NAVIGATION";
        }
        
        newBtn.click();
        await wait(1500);
        
        // 2. Look for the "Doc" (文档) option
        const docBtn = Array.from(document.querySelectorAll('.ud-menu-item, .item-text, div')).find(el => el.textContent && el.textContent.trim() === '文档');
                       
        if (!docBtn) return "SHORTCUT_NAVIGATION";
        docBtn.click();
        
        return "SUCCESS_OPENING_NEW_TAB";
      })()
    `);

    if (docUrl === "SHORTCUT_NAVIGATION" || docUrl.startsWith("ERROR")) {
        console.log('[FeishuConnector] UI click failed or used shortcut, forcing navigation...');
        // Directly navigate to the creation shortcut
        await cdpTools.navigate("https://docs.feishu.cn/create");
        await new Promise(r => setTimeout(r, 6000));
    } else {
        console.log('[FeishuConnector] UI clicked for new doc, waiting for new tab...');
        await new Promise(r => setTimeout(r, 4000));
        // Since Feishu opens a new tab, and we are stuck in the current tabId, 
        // we might not be able to interact with the new document easily without switching targets.
        // Let's force the current tab to navigate to the new doc page anyway to guarantee we have control.
        await cdpTools.navigate("https://docs.feishu.cn/create");
        await new Promise(r => setTimeout(r, 6000));
    }

    // Now we should be in the editor
    const currentUrl = await cdpTools.evaluate<string>('window.location.href');
    
    // Write Title and Content using CDP Type
    // 1. Write Title
    console.log('[FeishuConnector] Writing title...');
    await cdpTools.evaluate(`
      const titleInput = document.querySelector('.title-block') || document.querySelector('.doc-title-input');
      if(titleInput) {
        titleInput.focus();
      }
    `);
    await cdpTools.type("body", title); // Fallback to body typing if focus worked
    await cdpTools.type("body", "\n"); // Press Enter

    // 2. Write Content
    console.log('[FeishuConnector] Writing content...');
    // We might need to split content or paste it
    // For simplicity, we use type, but for markdown paste might be better
    // Let's use evaluate to insert text if typing is too slow or loses focus
    await cdpTools.evaluate(`
      (async () => {
         const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.activeElement;
         if(editor) {
             // Basic implementation of paste/insert text
             document.execCommand('insertText', false, \`${content.replace(/`/g, '\\`')}\`);
         }
      })()
    `);

    await new Promise(r => setTimeout(r, 2000)); // Wait for auto-save
    
    return currentUrl;
  }
};
