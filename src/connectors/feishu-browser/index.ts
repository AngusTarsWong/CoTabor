
import { CdpTools } from "../../drivers/cdp/tools";
import { DOMDriver } from "../../drivers/dom/index";

/**
 * Feishu document connector.
 *
 * Encapsulates the Feishu-specific interaction model, including:
 * 1. Auto-scrolling lazy-loaded content
 * 2. Recognizing document structure such as headings and outlines
 * 3. Handling richer document surfaces such as tables in future extensions
 */

// Simple auto-scroll implementation. Can be replaced with a richer strategy later.
async function autoScrollAndRead(cdpTools: CdpTools): Promise<string> {
  console.log('[FeishuConnector] Starting auto-scroll sequence...');
  
  // Run the scrolling logic inside the page context.
  const content = await cdpTools.evaluate<string>(`
    (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // Prefer the main scrolling surface. This simplified version just uses window.
      let lastHeight = document.body.scrollHeight;
      let noChangeCount = 0;
      
      // Limit the loop to avoid hanging forever on infinite-scroll surfaces.
      for(let i=0; i<30; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await wait(800);
        
        const newHeight = document.body.scrollHeight;
        if(newHeight === lastHeight) {
          noChangeCount++;
          if(noChangeCount >= 3) break;
        } else {
          noChangeCount = 0;
          lastHeight = newHeight;
        }
      }
      
      // Prefer the editor region and fall back to the full page body.
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
   * Return whether the current URL points to a Feishu document.
   */
  isFeishuUrl(url: string): boolean {
    if (!url) return false;
    return url.includes('feishu.cn/docs') || url.includes('feishu.cn/docx') || url.includes('larksuite.com/docs');
  },

  /**
   * Read document content, including an auto-scroll pass for lazy-loaded text.
   */
  async readDocument(tabId: number): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    
    // Read the document title first.
    const title = await cdpTools.evaluate<string>('document.title');
    
    // Then collect the full body after scrolling through the document.
    const content = await autoScrollAndRead(cdpTools);
    
    // Return a lightweight labeled text payload.
    return `[Feishu Doc: ${title}]\n\n${content}`;
  },

  /**
   * Create a new document through CDP automation.
   */
  async writeDocument(tabId: number, title: string, content: string, folderUrl: string): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    const domDriver = new DOMDriver(tabId);
    
    console.log(`[FeishuConnector] Starting document creation via CDP in folder: ${folderUrl}`);

    // 1. Navigate to target folder URL
    await cdpTools.navigate(folderUrl);
    // Wait for the folder view to load
    await new Promise(r => setTimeout(r, 8000)); 

    // Intercept `window.open` and `_blank` anchors so the new doc stays in the
    // current tab and CDP control is preserved. Also inject a temporary mask to
    // reduce user interference during automation.
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

        // Inject a temporary mask to reduce accidental user interaction.
        const mask = document.createElement('div');
        mask.id = 'cotabor-protection-mask';
        mask.style.position = 'fixed';
        mask.style.top = '0';
        mask.style.left = '0';
        mask.style.width = '100vw';
        mask.style.height = '100vh';
        mask.style.backgroundColor = 'rgba(0,0,0,0.1)';
        mask.style.zIndex = '99999999';
        mask.style.pointerEvents = 'auto'; // Capture pointer events
        mask.innerHTML = '<div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);background:white;padding:5px 15px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,0.2);font-family:sans-serif;font-size:14px;color:#333;pointer-events:none;">CoTabor: 自动执行中，请勿操作...</div>';
        document.body.appendChild(mask);
      })();
    `);

    // Temporarily disable the mask when CDP needs to click through it.
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

    // Look for the "New" button using the PageAgent-derived DOM snapshot.
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

    await new Promise(r => setTimeout(r, 2000));

    // Then pick the "Doc" entry from the menu.
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
    // Wait for the editor page to open.
    await new Promise(r => setTimeout(r, 6000));
    
    // If navigation did not happen, try to find the newly created untitled doc.
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

    // At this point we should be inside the editor.
    const currentUrl = await cdpTools.evaluate<string>('window.location.href');
    
    // Write title and content via CDP.
    console.log('[FeishuConnector] Writing title...');
    await removeMask();
    await cdpTools.evaluate(`
      const titleInput = document.querySelector('.title-block') || document.querySelector('.doc-title-input');
      if(titleInput) {
        titleInput.focus();
      }
    `);
    await cdpTools.type("body", title); // Fall back to body typing if focus succeeded
    await cdpTools.type("body", "\n");

    // Write the main content body.
    console.log('[FeishuConnector] Writing content...');
    await cdpTools.evaluate(`
      (async () => {
         const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.activeElement;
         if(editor) {
             // Basic text insertion strategy.
             document.execCommand('insertText', false, \`${content.replace(/`/g, '\\`')}\`);
         }
      })()
    `);
    await restoreMask();

    await new Promise(r => setTimeout(r, 2000));
    
    return currentUrl;
  },

  /**
   * Append content to the currently open Feishu document.
   * This bypasses unreliable DOM targeting by using physical clicks and text insertion.
   */
  async appendTextToCurrentDoc(tabId: number, content: string): Promise<boolean> {
    const cdpTools = new CdpTools(tabId);
    
    console.log('[FeishuConnector] Starting to append text to current document...');

    try {
      // Temporarily disable any existing protection mask.
      await cdpTools.evaluate(`
        const mask = document.getElementById('cotabor-protection-mask');
        if (mask) mask.style.pointerEvents = 'none';
      `);

      // Focus the editor with real clicks. Rich-text focus is not reliable through DOM APIs.
      const viewport = await cdpTools.evaluate<{width: number, height: number}>(`
        ({width: window.innerWidth, height: window.innerHeight})
      `);
      
      // Click slightly below the center to activate the caret.
      await cdpTools.mouseClick(viewport.width / 2, viewport.height * 0.6);
      await new Promise(r => setTimeout(r, 500));
      
      // A second click helps on pages that require double activation.
      await cdpTools.mouseClick(viewport.width / 2, viewport.height * 0.7);
      await new Promise(r => setTimeout(r, 500));

      // Insert text directly. `execCommand('insertText')` remains the most compatible path here.
      await cdpTools.evaluate(`
        (async () => {
           // Ensure we have a target editor surface.
           const editor = document.querySelector('.document-editor') || document.querySelector('.bear-editor') || document.activeElement;
           if(editor) {
               // Use the browser-native command path to bypass editor interception.
               document.execCommand('insertText', false, \`\\n\`);
               document.execCommand('insertText', false, \`${content.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`);
               document.execCommand('insertText', false, \`\\n\`);
           }
        })()
      `);

      // Re-enable the protection mask.
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
