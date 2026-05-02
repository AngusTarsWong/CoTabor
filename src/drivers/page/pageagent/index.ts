import fs from 'fs';
import path from 'path';
import { cdpClient } from '../../cdp';
import { IPageDriver } from '../interface';

export class PageAgentDriver implements IPageDriver {
  private tabId: number | null = null;
  private isInitialized = false;

  async init(tabId: number): Promise<void> {
    this.tabId = tabId;

    // Load the bundled PageAgent runtime script.
    let sdkCode = '';

    // Detect whether we are running inside the browser extension.
    const isBrowserEnv = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;

    try {
      if (isBrowserEnv) {
        console.log('[PageAgentDriver] Loading SDK via chrome.runtime.getURL...');
        const response = await fetch(chrome.runtime.getURL('page-agent.bundle.js'));
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        sdkCode = await response.text();
      } else {
        const sdkPath = path.resolve(process.cwd(), 'public', 'page-agent.bundle.js');
        sdkCode = fs.readFileSync(sdkPath, 'utf-8');
      }

      // Guard against null body/documentElement access inside the bundled script.
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollWidth/g, '(document.documentElement?.scrollWidth || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollHeight/g, '(document.documentElement?.scrollHeight || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollLeft/g, '(document.documentElement?.scrollLeft || 0)');
      sdkCode = sdkCode.replace(/document\.documentElement\.scrollTop/g, '(document.documentElement?.scrollTop || 0)');
      sdkCode = sdkCode.replace(/document\.body\.scrollWidth/g, '(document.body?.scrollWidth || 0)');
      sdkCode = sdkCode.replace(/document\.body\.scrollHeight/g, '(document.body?.scrollHeight || 0)');
    } catch (error: any) {
      console.error('[PageAgentDriver] Failed to load SDK:', error);
      throw new Error(`Failed to load page-agent SDK: ${error.message}`);
    }

    // Inject the SDK and expose a shared `window.__PageController` instance.
    const injectExpression = `
      (() => {
        if (window.__PageController) return 'already_injected';
        
        ${sdkCode}
        
        // Our bundle exposes the constructor as window.PageAgent.PageController.
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

    // Preserve the native PageAgent `[index]` labeling shared by planner and executor.
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
    
    // `clickElement` accepts a numeric index, so convert before dispatch.
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

    // Escape input text so quotes do not break the injected JavaScript.
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
    
    // Focus the target element first when an element id is provided.
    if (elementId) {
      const index = parseInt(elementId, 10);
      if (!isNaN(index)) {
        await cdpClient.send(this.tabId!, 'Runtime.evaluate', {
          expression: `window.__PageController.clickElement(${index})`, // Reuse click for focus
          awaitPromise: true
        });
      }
    }

    // Send the key event sequence.
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
