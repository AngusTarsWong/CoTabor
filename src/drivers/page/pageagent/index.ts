import fs from 'fs';
import path from 'path';
import { cdpClient } from '../../cdp';
import { IPageDriver } from '../interface';

export class PageAgentDriver implements IPageDriver {
  private tabId: number | null = null;
  private isInitialized = false;

  async init(tabId: number): Promise<void> {
    this.tabId = tabId;
    
    // 读取我们刚才从阿里 pageagent 打包出来的核心脚本
    const sdkPath = path.join(__dirname, 'dist', 'pageagent-core.js');
    let sdkCode = '';
    try {
      sdkCode = fs.readFileSync(sdkPath, 'utf-8');
    } catch (error) {
      console.warn('[PageAgentDriver] In browser extension environment, fetching SDK via URL...');
      // 在浏览器插件环境下，fs 不可用，需要通过 fetch 获取静态资源
      // 这里假设在 rsbuild 中我们把 dist 放到了静态资源目录
      // 实际实现可能需要根据 WXT/Rsbuild 的机制调整
      throw new Error('Browser environment SDK loading not yet implemented. Please run in Node/Debug mode.');
    }

    // 注入 SDK 并实例化挂载到全局变量 window.__PageController
    const injectExpression = `
      (() => {
        if (window.__PageController) return 'already_injected';
        
        ${sdkCode}
        
        // iife 模式下，库会被暴露为全局变量 PageController
        if (typeof PageController !== 'undefined') {
          window.__PageController = new PageController.PageController({ enableMask: false });
          return 'injected';
        }
        return 'failed_to_find_class';
      })();
    `;

    const result = await cdpClient.send(tabId, 'Runtime.evaluate', {
      expression: injectExpression,
      returnByValue: true
    });

    if (result?.result?.value === 'failed_to_find_class') {
      throw new Error('[PageAgentDriver] Failed to initialize PageController class from SDK');
    }

    this.isInitialized = true;
    console.log(`[PageAgentDriver] Injected successfully into tab ${tabId}`);
  }

  private ensureInitialized() {
    if (!this.isInitialized || !this.tabId) {
      throw new Error('[PageAgentDriver] Driver not initialized. Call init() first.');
    }
  }

  async getSemanticDOM(): Promise<string> {
    this.ensureInitialized();
    
    // 调用阿里内部的 getBrowserState() 方法获取精简 DOM 和信息
    const expression = `
      (async () => {
        const state = await window.__PageController.getBrowserState();
        return state.content;
      })()
    `;

    const result = await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      throw new Error(`[PageAgentDriver] getSemanticDOM failed: ${JSON.stringify(result.exceptionDetails)}`);
    }

    return result.result.value;
  }

  async click(elementId: string): Promise<boolean> {
    this.ensureInitialized();
    
    // PageAgent 的 clickElement 接受的是数字索引，我们需要转换
    const index = parseInt(elementId, 10);
    if (isNaN(index)) {
      throw new Error(`[PageAgentDriver] Invalid elementId: ${elementId}, expected a number.`);
    }

    const expression = `
      (async () => {
        const res = await window.__PageController.clickElement(${index});
        return res;
      })()
    `;

    const result = await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    return result?.result?.value?.success === true;
  }

  async type(elementId: string, text: string): Promise<boolean> {
    this.ensureInitialized();
    
    const index = parseInt(elementId, 10);
    if (isNaN(index)) {
      throw new Error(`[PageAgentDriver] Invalid elementId: ${elementId}, expected a number.`);
    }

    // 注意对 text 进行转义，防止引号破坏 JS 字符串
    const safeText = JSON.stringify(text);
    const expression = `
      (async () => {
        const res = await window.__PageController.inputText(${index}, ${safeText});
        return res;
      })()
    `;

    const result = await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    return result?.result?.value?.success === true;
  }

  async scroll(direction: 'up' | 'down'): Promise<boolean> {
    this.ensureInitialized();
    
    const isDown = direction === 'down';
    const expression = `
      (async () => {
        const res = await window.__PageController.scroll({ down: ${isDown}, numPages: 1 });
        return res;
      })()
    `;

    const result = await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    return result?.result?.value?.success === true;
  }
}
