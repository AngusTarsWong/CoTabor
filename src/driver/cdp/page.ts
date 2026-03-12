/// <reference types="chrome" />

import { CdpKeyboard } from './input';
import { assert, sleep } from '../utils';

export class ChromeExtensionProxyPage {
  private activeTabId: number | null = null;
  private destroyed = false;
  
  public _continueWhenFailedToAttachDebugger = false;

  public keyboard: CdpKeyboard;

  constructor() {
    // 适配 CdpKeyboard 需要的 InternalCDPSession 接口
    const cdpClient = {
      send: (command: string, params: any) => this.sendCommandToDebugger(command, params),
    };
    this.keyboard = new CdpKeyboard(cdpClient);
  }

  /**
   * 设置当前要操作的 Tab ID
   */
  public async setActiveTabId(tabId: number) {
    if (this.activeTabId) {
      throw new Error(
        `Active tab id is already set to ${this.activeTabId}, cannot change to ${tabId}`,
      );
    }
    // 切换到该标签页
    await chrome.tabs.update(tabId, { active: true });
    this.activeTabId = tabId;
  }

  public async getActiveTabId() {
    return this.activeTabId;
  }

  /**
   * 获取当前所有标签页列表
   */
  public async getBrowserTabList(): Promise<
    { id: number; title: string; url: string; active: boolean }[]
  > {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) => ({
        id: tab.id!,
        title: tab.title || '',
        url: tab.url || '',
        active: tab.active,
      }));
  }

  /**
   * 获取当前激活的标签页 ID，如果没有设置 activeTabId，则自动获取当前窗口的活动标签页
   */
  public async getTabIdOrConnectToCurrentTab() {
    if (this.activeTabId) {
      return this.activeTabId;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    
    if (!tabId) {
      throw new Error('No active tab found');
    }
    
    this.activeTabId = tabId;
    return this.activeTabId;
  }

  /**
   * 截图
   * @returns base64 编码的图片数据 (data:image/png;base64,...)
   */
  public async screenshot(): Promise<string> {
    await this.getTabIdOrConnectToCurrentTab();
    return new Promise((resolve, reject) => {
      // @ts-ignore - TS types for captureVisibleTab are a bit strict about the first argument
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl: string) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * 确保 Debugger 已连接到当前标签页
   * 使用懒加载模式 - 只有在需要时才连接
   */
  private async ensureDebuggerAttached() {
    assert(!this.destroyed, 'Page is destroyed');

    const tabId = await this.getTabIdOrConnectToCurrentTab();
    const tab = await chrome.tabs.get(tabId);
    
    if (tab.url?.startsWith('chrome://')) {
      throw new Error(
        'Cannot attach debugger to chrome:// pages. Please use a normal page (http/https/file).',
      );
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      console.log('Debugger attached to tab:', tabId);
    } catch (error) {
      const errorMsg = (error as Error)?.message || '';
      // 如果已经连接，则忽略错误
      if (errorMsg.includes('Another debugger is already attached')) {
        // console.log('Debugger already attached to tab:', tabId);
        return;
      }

      if (this._continueWhenFailedToAttachDebugger) {
        console.warn(
          'Failed to attach debugger, but continuing due to flag',
          error,
        );
        return;
      }

      throw error;
    }

    // 等待连接稳定
    await sleep(200);
  }

  /**
   * 断开 Debugger 连接
   */
  public async detachDebugger(tabId?: number) {
    const tabIdToDetach = tabId || (await this.getTabIdOrConnectToCurrentTab());
    console.log('Detaching debugger from tab:', tabIdToDetach);

    try {
      await chrome.debugger.detach({ tabId: tabIdToDetach });
      console.log('Debugger detached successfully from tab:', tabIdToDetach);
    } catch (error) {
      // 标签页可能已关闭或已断开连接，这是正常的
      console.warn(
        'Failed to detach debugger (may already be detached):',
        error,
      );
    }
  }

  /**
   * 发送 CDP 命令
   * 包含自动重试机制
   */
  public async sendCommandToDebugger<ResponseType = any, RequestType = any>(
    command: string,
    params: RequestType,
    retryCount = 0,
  ): Promise<ResponseType> {
    const MAX_RETRIES = 2;
    const tabId = await this.getTabIdOrConnectToCurrentTab();

    try {
      // 尝试直接发送命令
      // 注意：如果之前没 attach，这里会失败，然后进入 catch 块进行自动 attach
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        command,
        params as any,
      )) as ResponseType;

      return result;
    } catch (error) {
      // 检查错误是否是因为未连接
      const errorMsg = (error as Error)?.message || '';
      const isDetachError =
        errorMsg.includes('Debugger is not attached') ||
        errorMsg.includes('Cannot access a Target') ||
        errorMsg.includes('No target with given id');

      if (isDetachError && retryCount < MAX_RETRIES) {
        console.log(
          `Debugger not attached for command "${command}", attempting to attach (retry ${retryCount + 1}/${MAX_RETRIES})`,
        );

        // 尝试连接并重试
        await this.ensureDebuggerAttached();

        return this.sendCommandToDebugger<ResponseType, RequestType>(
          command,
          params,
          retryCount + 1,
        );
      }

      // 其他错误直接抛出
      throw error;
    }
  }
}
