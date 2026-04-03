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
    // 读取我们刚才从阿里 pageagent 打包出来的核心脚本
    const sdkPath = path.resolve(process.cwd(), 'public', 'page-agent.bundle.js');
    let sdkCode = '';
    try {
      sdkCode = fs.readFileSync(sdkPath, 'utf-8');
      // Patch for "Cannot read properties of null (reading 'scrollWidth')" when document.documentElement or document.body is null
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollWidth/g, '(document.documentElement?.scrollWidth || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollHeight/g, '(document.documentElement?.scrollHeight || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollLeft/g, '(document.documentElement?.scrollLeft || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollTop/g, '(document.documentElement?.scrollTop || 0)');
      sdkCode = sdkCode.replace(/document\.body\.scrollWidth/g, '(document.body?.scrollWidth || 0)');
      sdkCode = sdkCode.replace(/document\.body\.scrollHeight/g, '(document.body?.scrollHeight || 0)');
    } catch (error) {
      console.warn('[PageAgentDriver] In browser extension environment, fetching SDK via URL...');
      throw new Error('Browser environment SDK loading not yet implemented. Please run in Node/Debug mode.');
    }

    // 注入 SDK 并实例化挂载到全局变量 window.__PageController
    const injectExpression = `
      (() => {
        if (window.__PageController) return 'already_injected';
        
        ${sdkCode}
        
        // 我们构建的 bundle 暴露在了 window.PageAgent.PageController
        if (typeof window.PageAgent !== 'undefined' && typeof window.PageAgent.PageController !== 'undefined') {
          window.__PageController = new window.PageAgent.PageController({ enableMask: false });
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

    // 使用 PageAgent 原生的 getBrowserState().content
    // 保留其 [index] 语义标注体系，供 Planner 和 Executor 共同使用
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

  async press(key: string, elementId?: string): Promise<boolean> {
    this.ensureInitialized();
    
    // 如果有 elementId，先尝试聚焦
    if (elementId) {
      const index = parseInt(elementId, 10);
      if (!isNaN(index)) {
        await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
          expression: `window.__PageController.clickElement(${index})`, // 借用 click 来聚焦
          awaitPromise: true
        });
      }
    }

    // 发送回车/按键
    const result = await cdpClient.send(this.tabId!, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: key,
      code: key,
      windowsVirtualKeyCode: key === 'Enter' ? 13 : 0,
      nativeVirtualKeyCode: key === 'Enter' ? 13 : 0,
    });
    
    await cdpClient.send(this.tabId!, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: key,
      code: key,
      windowsVirtualKeyCode: key === 'Enter' ? 13 : 0,
      nativeVirtualKeyCode: key === 'Enter' ? 13 : 0,
    });

    return !!result;
  }
}
