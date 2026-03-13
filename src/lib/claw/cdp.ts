/**
 * Chrome Debugger Protocol (CDP) Wrapper
 * Handles low-level connection to the browser tab.
 */

export const cdp = {
  /**
   * Attach debugger to a specific tab
   */
  attach: async (tabId: number) => {
    const target = { tabId };
    try {
      await chrome.debugger.attach(target, "1.3");
      console.log(`[Claw] Attached to tab ${tabId}`);
    } catch (e: any) {
      // Ignore if already attached
      if (e.message?.includes("Already attached")) {
        return;
      }
      throw e;
    }
  },

  /**
   * Detach debugger from a tab
   */
  detach: async (tabId: number) => {
    const target = { tabId };
    try {
      await chrome.debugger.detach(target);
      console.log(`[Claw] Detached from tab ${tabId}`);
    } catch (e: any) {
      // Ignore if not attached
      console.warn(`[Claw] Detach failed: ${e.message}`);
    }
  },

  /**
   * Send a CDP command
   */
  sendCommand: async (tabId: number, method: string, params: any = {}) => {
    const target = { tabId };
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(target, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  },
};
