import CDP from 'chrome-remote-interface';
import { CdpClient, setCdpClient } from './index';

/**
 * A Node.js implementation of the CdpClient interface.
 * This is used for testing and running the agent from the command line,
 * connecting to a real Chrome instance running with --remote-debugging-port.
 */
class NodeCdpClient implements CdpClient {
  private client: any;
  private tabMap: Map<number, string> = new Map();
  private host: string;
  private port: number;

  constructor(host = 'localhost', port = 9222) {
    this.host = host;
    this.port = port;
  }

  async connectToChrome() {
    try {
      // Get all targets
      const targets = await CDP.List({ host: this.host, port: this.port });
      
      // We will just return targets and let the caller decide
      return targets;
    } catch (err) {
      console.error(`[NodeCDP] Error connecting to Chrome:`, err);
      throw err;
    }
  }

  async attach(tabId: number): Promise<void> {
    const targetId = this.tabMap.get(tabId);
    if (!targetId) {
       // In Node environment, we might just connect to the first available page if no mapping exists
       const targets = await CDP.List({ host: this.host, port: this.port });
       const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
       if (pageTarget) {
           this.tabMap.set(tabId, pageTarget.id);
       } else {
           throw new Error(`[NodeCDP] Cannot find target for tabId: ${tabId}`);
       }
    }

    const idToConnect = this.tabMap.get(tabId);
    
    try {
      this.client = await CDP({ target: idToConnect, host: this.host, port: this.port });
      
      // Enable necessary domains
      await this.client.Page.enable();
      await this.client.Runtime.enable();
      
      console.log(`[NodeCDP] Attached to target: ${idToConnect}`);
    } catch (err) {
      console.error(`[NodeCDP] Failed to attach:`, err);
      throw err;
    }
  }

  async detach(tabId: number): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      console.log(`[NodeCDP] Detached from tabId: ${tabId}`);
    }
  }

  async send<Req = any, Res = any>(tabId: number, method: string, params?: Req): Promise<Res> {
    if (!this.client) {
      await this.attach(tabId);
    }
    
    try {
      // Split domain and method (e.g. 'Runtime.evaluate')
      const [domain, cmd] = method.split('.');
      if (!this.client[domain] || !this.client[domain][cmd]) {
        throw new Error(`[NodeCDP] Unsupported method: ${method}`);
      }
      
      const result = await this.client[domain][cmd](params);
      return result as Res;
    } catch (err) {
      console.error(`[NodeCDP] Error sending command ${method}:`, err);
      throw err;
    }
  }
}

/**
 * Initializes the Node CDP client, connects to Chrome, and sets it as the active client.
 * Returns the list of available browser targets.
 */
export async function initNodeCdpClient(url: string = 'http://localhost:9222') {
  const urlObj = new URL(url);
  const client = new NodeCdpClient(urlObj.hostname, parseInt(urlObj.port) || 9222);
  const targets = await client.connectToChrome();
  
  // Override the default extension CDP client with our Node client
  setCdpClient(client);
  
  return targets;
}
