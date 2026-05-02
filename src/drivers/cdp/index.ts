/**
 * Minimal CDP transport layer.
 * Wraps `chrome.debugger` and exposes the primitives used by the extension.
 */

export interface CdpClient {
  /** Attach to a specific tab. */
  attach: (tabId: number) => Promise<void>;

  /** Detach from a specific tab. */
  detach: (tabId: number) => Promise<void>;

  /** Send a CDP command. */
  send: <Req = any, Res = any>(tabId: number, method: string, params?: Req) => Promise<Res>;
}

const extensionCdpClient: CdpClient = {
  async attach(tabId: number) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      console.log(`[CDP] Attached to tabId: ${tabId}`);
    } catch (error: any) {
      const errorMsg = error?.message || '';
      // Ignore the expected "already attached" race.
      if (errorMsg.includes('Another debugger is already attached')) {
        console.log(`[CDP] tabId ${tabId} is already attached`);
        return;
      }
      throw error;
    }
  },

  async detach(tabId: number) {
    try {
      await chrome.debugger.detach({ tabId });
      console.log(`[CDP] Detached from tabId: ${tabId}`);
    } catch (error: any) {
      console.warn(`[CDP] Failed to detach from tabId ${tabId}:`, error?.message);
    }
  },

  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    try {
      const result = await chrome.debugger.sendCommand(
        { tabId },
        method,
        params as any
      );
      return result as Res;
    } catch (error: any) {
      const errorMsg = error?.message || '';
      const isDetachError =
        errorMsg.includes('Debugger is not attached') ||
        errorMsg.includes('Cannot access a Target') ||
        errorMsg.includes('No target with given id');

      if (isDetachError) {
        console.log(`[CDP] "${method}" failed because the debugger was detached. Reattaching...`);
        await this.attach(tabId);
        
        const retryResult = await chrome.debugger.sendCommand(
          { tabId },
          method,
          params as any
        );
        return retryResult as Res;
      }

      throw error;
    }
  }
};

// Default browser-extension client.
let activeCdpClient: CdpClient = extensionCdpClient;

// Allow tests or Node.js scripts to swap in a different transport.
export const setCdpClient = (client: CdpClient) => {
  activeCdpClient = client;
};

// Export a stable proxy so callers always hit the latest active client.
export const cdpClient: CdpClient = {
  attach: (tabId) => activeCdpClient.attach(tabId),
  detach: (tabId) => activeCdpClient.detach(tabId),
  send: (tabId, method, params) => activeCdpClient.send(tabId, method, params)
};

export * from './input';
export * from './tools';
