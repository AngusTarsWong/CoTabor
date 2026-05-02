
import { CdpTools } from "../../drivers/cdp/tools";
import { DOMDriver } from "../../drivers/dom/index";

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
  async writeDocument(tabId: number, title: string, content: string, folderUrl: string): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    const domDriver = new DOMDriver(tabId);
    
    console.log(`[FeishuConnector] Starting document creation via CDP in folder: ${folderUrl}`);

    // 1. Navigate to target folder URL
    await cdpTools.navigate(folderUrl);
    // Wait for the folder view to load
    await new Promise(r => setTimeout(r, 8000)); 

    // 拦截 window.open，强制在当前标签页打开新建的文档，以便保留 CDP 的控制权
    // 并且拦截目标为空的 a 标签，并注入防干扰遮罩层（Mask Layer Protection）
    await cdpTools.evaluate(`
      (function() {
        window._originalOpen = window.open;
        window.open = function(url, target, features) {
            window.location.href = url;
            return window;
        };
        
        document.addEventListener('click', function(e) {
            let target = e.target;
            while(target && target !== document && target.tagName !== 'A') {
                target = target.parentNode;
            }
            if (target && target.tagName === 'A' && target.getAttribute('target') === '_blank') {
                target.removeAttribute('target');
            }
        }, true);

        // 注入遮罩层防止用户干扰
        const mask = document.createElement('div');
        mask.id = 'cotabor-protection-mask';
        mask.style.position = 'fixed';
        mask.style.top = '0';
        mask.style.left = '0';
        mask.style.width = '100vw';
        mask.style.height = '100vh';
        mask.style.backgroundColor = 'rgba(0,0,0,0.1)';
        mask.style.zIndex = '99999999';
        mask.style.pointerEvents = 'auto'; // 拦截点击
        mask.innerHTML = '<div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);background:white;padding:5px 15px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,0.2);font-family:sans-serif;font-size:14px;color:#333;pointer-events:none;">CoTabor: 自动执行中，请勿操作...</div>';
        document.body.appendChild(mask);
      })();
    `);

    // 临时移除遮罩层以便 CDP 点击可以穿透
    const removeMask = async () => {
      await cdpTools.evaluate(`
        const mask = document.getElementById('cotabor-protection-mask');
        if (mask) mask.style.pointerEvents = 'none';
      `);
    };
    const restoreMask = async () => {
      await cdpTools.evaluate(`
        const mask = document.getElementById('cotabor-protection-mask');
        if (mask) mask.style.pointerEvents = 'auto';
      `);
    };

    // 寻找 "新建" 按钮 (基于 PageAgent 的 DOM 提取)
    console.log('[FeishuConnector] Looking for "New" button...');
    let clickedNew = false;
    for (let i = 0; i < 5; i++) {
      const { elements } = await domDriver.extractDOM();
      const newBtn = elements.find(el => el.text.includes('新建') && (el.tagName === 'button' || el.tagName === 'div'));
      
      if (newBtn) {
        await removeMask();
        await domDriver.clickByIndex(elements, newBtn.index);
        await restoreMask();
        clickedNew = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!clickedNew) {
      throw new Error(`Failed to create document: ERROR_CANNOT_FIND_NEW_BTN`);
    }

    await new Promise(r => setTimeout(r, 2000)); // 等待下拉菜单动画和渲染

    // 寻找 "文档" 选项
    console.log('[FeishuConnector] Looking for "Doc" button...');
    let clickedDoc = false;
    for (let i = 0; i < 8; i++) {
      const { elements } = await domDriver.extractDOM();
      const docBtn = elements.find(el => {
        const text = el.text.trim();
        return (text === '文档' || text === '飞书文档' || text === 'Doc') && el.tagName !== 'input';
      });
      
      if (docBtn) {
        await removeMask();
        await domDriver.clickByIndex(elements, docBtn.index);
        await restoreMask();
        clickedDoc = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!clickedDoc) {
      throw new Error(`Failed to create document: ERROR_CANNOT_FIND_DOC_BTN`);
    }

    console.log('[FeishuConnector] UI clicked for new doc, waiting for page navigation...');
    // 等待页面跳转到新建的文档页面
    await new Promise(r => setTimeout(r, 6000));
    
    // 检查是否跳转成功，如果没有，尝试在页面上查找刚创建的未命名文档并点击
    const checkUrl = await cdpTools.evaluate<string>('window.location.href');
    if (checkUrl.includes('folder') || checkUrl.includes('space/home')) {
        console.log('[FeishuConnector] Still in folder view. Page did not navigate. Checking if new doc opened in background...');
        
        const { elements } = await domDriver.extractDOM();
        const untitledDoc = elements.find(el => el.text.includes('未命名'));
        
        if (untitledDoc) {
            await removeMask();
            await domDriver.clickByIndex(elements, untitledDoc.index);
            await restoreMask();
            console.log('[FeishuConnector] Found and clicked recent "Untitled" document.');
            await new Promise(r => setTimeout(r, 5000));
        } else {
            throw new Error('Failed to navigate to the new document editor.');
        }
    }

    // Now we should be in the editor
    const currentUrl = await cdpTools.evaluate<string>('window.location.href');
    
    // Write Title and Content using CDP Type
    // 1. Write Title
    console.log('[FeishuConnector] Writing title...');
    await removeMask();
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
    await cdpTools.evaluate(`
      (async () => {
         const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.activeElement;
         if(editor) {
             // Basic implementation of paste/insert text
             document.execCommand('insertText', false, \`${content.replace(/`/g, '\\`')}\`);
         }
      })()
    `);
    await restoreMask();

    await new Promise(r => setTimeout(r, 2000)); // Wait for auto-save
    
    return currentUrl;
  },

  /**
   * 在当前打开的飞书文档中追写/追加内容
   * 这是为了解决 DOM 感知无法找到飞书输入框的问题，直接使用物理点击 + 键盘输入
   */
  async appendTextToCurrentDoc(tabId: number, content: string): Promise<boolean> {
    const cdpTools = new CdpTools(tabId);
    
    console.log('[FeishuConnector] Starting to append text to current document...');

    try {
      // 1. 尝试临时移除可能存在的遮罩层
      await cdpTools.evaluate(`
        const mask = document.getElementById('cotabor-protection-mask');
        if (mask) mask.style.pointerEvents = 'none';
      `);

      // 2. 聚焦到编辑器（物理点击页面中央靠下的位置，通常是空白处）
      // 飞书的富文本很难用 DOM focus，最好用真实的 CDP click
      const viewport = await cdpTools.evaluate<{width: number, height: number}>(`
        ({width: window.innerWidth, height: window.innerHeight})
      `);
      
      // 点击页面中心稍微偏下一点的位置，尝试激活光标
      await cdpTools.mouseClick(viewport.width / 2, viewport.height * 0.6);
      await new Promise(r => setTimeout(r, 500));
      
      // 再次点击确保激活 (有时候需要双击或者点两下)
      await cdpTools.mouseClick(viewport.width / 2, viewport.height * 0.7);
      await new Promise(r => setTimeout(r, 500));

      // 3. 尝试直接输入文字。CDP 的 Input.insertText 或者逐字发送
      // 使用 evaluate 执行 insertText 是最兼容飞书富文本拦截的方法
      await cdpTools.evaluate(`
        (async () => {
           // 确保有焦点
           const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.activeElement;
           if(editor) {
               // 利用浏览器原生命令插入文本，这通常能穿透飞书的拦截
               document.execCommand('insertText', false, \`\\n\`);
               document.execCommand('insertText', false, \`${content.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`);
               document.execCommand('insertText', false, \`\\n\`);
           }
        })()
      `);

      // 4. 恢复遮罩层
      await cdpTools.evaluate(`
        const mask = document.getElementById('cotabor-protection-mask');
        if (mask) mask.style.pointerEvents = 'auto';
      `);

      console.log('[FeishuConnector] Successfully appended text.');
      return true;
    } catch (e) {
      console.error('[FeishuConnector] Failed to append text:', e);
      return false;
    }
  }
};
