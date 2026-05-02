/**
 * Detect extensions that may conflict with CDP attachment.
 */

/** Probe the page for `chrome-extension://` iframes or scripts. */
function detectConflictingExtensionIdInPage() {
  function checkNode(root: Document | ShadowRoot): string | null {
    const elements = root.querySelectorAll('*');
    for (const el of Array.from(elements)) {
      const src = (el as HTMLIFrameElement | HTMLScriptElement).src;
      if (src && (el.tagName === 'IFRAME' || el.tagName === 'SCRIPT')) {
        const match = src.match(/chrome-extension:\/\/([a-z]{32})/);
        if (match) return match[1];
      }
      
      if (el.shadowRoot) {
        const res = checkNode(el.shadowRoot);
        if (res) return res;
      }
    }
    return null;
  }
  return checkNode(document);
}

/** Scan a tab and return the conflicting extension name when detectable. */
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
