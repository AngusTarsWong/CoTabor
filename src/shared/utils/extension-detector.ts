/**
 * 工具函数：用于检测并获取导致 CDP 挂载失败的冲突插件信息
 */

/**
 * 注入页面执行的探测脚本：寻找含有 chrome-extension:// 的 iframe 或 script
 */
function detectConflictingExtensionIdInPage() {
  function checkNode(root: Document | ShadowRoot): string | null {
    const elements = root.querySelectorAll('*');
    for (const el of Array.from(elements)) {
      // 检查 src
      const src = (el as HTMLIFrameElement | HTMLScriptElement).src;
      if (src && (el.tagName === 'IFRAME' || el.tagName === 'SCRIPT')) {
        const match = src.match(/chrome-extension:\/\/([a-z]{32})/);
        if (match) return match[1];
      }
      
      // 深入 Shadow DOM 检查
      if (el.shadowRoot) {
        const res = checkNode(el.shadowRoot);
        if (res) return res;
      }
    }
    return null;
  }
  return checkNode(document);
}

/**
 * 扫描指定 Tab 找出冲突的插件名称
 */
export async function getConflictingExtensionName(tabId: number): Promise<string | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectConflictingExtensionIdInPage,
    });
    
    if (results && results.length > 0 && results[0].result) {
      const extensionId = results[0].result;
      try {
        const extInfo = await chrome.management.get(extensionId);
        return extInfo.name;
      } catch (e) {
        return `ID: ${extensionId}`;
      }
    }
  } catch (e) {
    console.warn('[ExtensionDetector] Failed to execute scan script:', e);
  }
  return null;
}
