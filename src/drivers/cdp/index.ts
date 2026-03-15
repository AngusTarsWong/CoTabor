/**
 * 极简的 CDP 驱动层
 * 封装 chrome.debugger 相关操作，提供与 Chrome 交互的基础能力。
 */

export interface CdpClient {
  /** 
   * 连接到指定 Tab 
   */
  attach: (tabId: number) => Promise<void>;
  
  /** 
   * 断开指定 Tab 的连接 
   */
  detach: (tabId: number) => Promise<void>;
  
  /** 
   * 发送 CDP 命令
   */
  send: <Req = any, Res = any>(tabId: number, method: string, params?: Req) => Promise<Res>;
}

const extensionCdpClient: CdpClient = {
  async attach(tabId: number) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      console.log(`[CDP] 成功挂载到 tabId: ${tabId}`);
    } catch (error: any) {
      const errorMsg = error?.message || '';
      // 如果已经挂载了，忽略该错误
      if (errorMsg.includes('Another debugger is already attached')) {
        console.log(`[CDP] tabId: ${tabId} 已被挂载`);
        return;
      }
      throw error;
    }
  },

  async detach(tabId: number) {
    try {
      await chrome.debugger.detach({ tabId });
      console.log(`[CDP] 成功从 tabId: ${tabId} 卸载`);
    } catch (error: any) {
      console.warn(`[CDP] 卸载 tabId: ${tabId} 失败:`, error?.message);
    }
  },

  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    try {
      // 尝试发送 CDP 命令
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

      // 如果是因为未挂载导致的失败，则尝试重新挂载并重试一次
      if (isDetachError) {
        console.log(`[CDP] 发送命令 "${method}" 时发现未挂载，尝试重新挂载...`);
        await this.attach(tabId);
        
        const retryResult = await chrome.debugger.sendCommand(
          { tabId },
          method,
          params as any
        );
        return retryResult as Res;
      }

      // 如果是其他错误，直接抛出
      throw error;
    }
  }
};

// 默认 CDP 客户端
let activeCdpClient: CdpClient = extensionCdpClient;

// 允许在运行时（如 Node.js 环境）注入自定义 CDP 客户端
export const setCdpClient = (client: CdpClient) => {
  activeCdpClient = client;
};

// 导出代理对象，确保使用的是最新的 activeCdpClient
export const cdpClient: CdpClient = {
  attach: (tabId) => activeCdpClient.attach(tabId),
  detach: (tabId) => activeCdpClient.detach(tabId),
  send: (tabId, method, params) => activeCdpClient.send(tabId, method, params)
};

export * from './input';
export * from './tools';
