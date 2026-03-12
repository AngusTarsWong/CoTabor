import { assert } from '@/shared/utils';
import ChromeExtensionProxyPage from '../chrome-extension/page';
import { BridgeEvent, DefaultBridgeServerPort, KeyboardEvent, MouseEvent, } from './common';
import { BridgeClient } from './io-client';
export class ExtensionBridgePageBrowserSide extends ChromeExtensionProxyPage {
    serverEndpoint;
    onDisconnect;
    onLogMessage;
    onConnectionRequest;
    bridgeClient = null;
    destroyOptions;
    newlyCreatedTabIds = [];
    // Connection confirmation state
    confirmationPromise = null;
    constructor(serverEndpoint, onDisconnect = () => { }, onLogMessage = () => { }, forceSameTabNavigation = true, onConnectionRequest) {
        super(forceSameTabNavigation);
        this.serverEndpoint = serverEndpoint;
        this.onDisconnect = onDisconnect;
        this.onLogMessage = onLogMessage;
        this.onConnectionRequest = onConnectionRequest;
    }
    async setupBridgeClient() {
        const endpoint = this.serverEndpoint || `ws://localhost:${DefaultBridgeServerPort}`;
        this.bridgeClient = new BridgeClient(endpoint, async (method, args) => {
            // Wait for user confirmation before processing any commands
            if (this.confirmationPromise) {
                const allowed = await this.confirmationPromise;
                if (!allowed) {
                    throw new Error('Connection denied by user');
                }
            }
            console.log('bridge call from cli side', method, args);
            if (method === BridgeEvent.ConnectNewTabWithUrl) {
                return this.connectNewTabWithUrl.apply(this, args);
            }
            if (method === BridgeEvent.GetBrowserTabList) {
                return this.getBrowserTabList.apply(this, args);
            }
            if (method === BridgeEvent.SetActiveTabId) {
                return this.setActiveTabId.apply(this, args);
            }
            if (method === BridgeEvent.ConnectCurrentTab) {
                return this.connectCurrentTab.apply(this, args);
            }
            if (method === BridgeEvent.UpdateAgentStatus) {
                return this.onLogMessage(args[0], 'status');
            }
            const tabId = await this.getActiveTabId();
            if (!tabId || tabId === 0) {
                throw new Error('no tab is connected');
            }
            // this.onLogMessage(`calling method: ${method}`);
            if (method.startsWith(MouseEvent.PREFIX)) {
                const actionName = method.split('.')[1];
                if (actionName === 'drag') {
                    return this.mouse[actionName].apply(this.mouse, args);
                }
                return this.mouse[actionName].apply(this.mouse, args);
            }
            if (method.startsWith(KeyboardEvent.PREFIX)) {
                const actionName = method.split('.')[1];
                if (actionName === 'press') {
                    return this.keyboard[actionName].apply(this.keyboard, args);
                }
                return this.keyboard[actionName].apply(this.keyboard, args);
            }
            if (!this[method]) {
                console.warn('method not found', method);
                return undefined;
            }
            try {
                // @ts-expect-error
                const result = await this[method](...args);
                return result;
            }
            catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                console.error('error calling method', method, args, e);
                this.onLogMessage(`Error calling method: ${method}, ${errorMessage}`, 'log');
                throw new Error(errorMessage, { cause: e });
            }
        }, 
        // on disconnect
        () => {
            return this.destroy();
        });
        await this.bridgeClient.connect();
        // Request user confirmation after connection is established
        if (this.onConnectionRequest) {
            this.onLogMessage('Waiting for user confirmation...', 'log');
            this.confirmationPromise = this.onConnectionRequest();
            const allowed = await this.confirmationPromise;
            this.confirmationPromise = null;
            if (!allowed) {
                this.onLogMessage('Connection denied by user', 'log');
                this.bridgeClient.disconnect();
                this.bridgeClient = null;
                throw new Error('Connection denied by user');
            }
        }
        this.onLogMessage(`Bridge connected, cli-side version v${this.bridgeClient.serverVersion}, browser-side version v${__VERSION__}`, 'log');
    }
    async connect() {
        return await this.setupBridgeClient();
    }
    async connectNewTabWithUrl(url, options = {
        forceSameTabNavigation: true,
    }) {
        const tab = await chrome.tabs.create({ url });
        const tabId = tab.id;
        assert(tabId, 'failed to get tabId after creating a new tab');
        // new tab
        this.onLogMessage(`Creating new tab: ${url}`, 'log');
        this.newlyCreatedTabIds.push(tabId);
        if (options?.forceSameTabNavigation) {
            this.forceSameTabNavigation = true;
        }
        await this.setActiveTabId(tabId);
    }
    async connectCurrentTab(options = {
        forceSameTabNavigation: true,
    }) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        assert(tabId, 'failed to get tabId');
        this.onLogMessage(`Connected to current tab: ${tabs[0]?.url}`, 'log');
        if (options?.forceSameTabNavigation) {
            this.forceSameTabNavigation = true;
        }
        await this.setActiveTabId(tabId);
    }
    async setDestroyOptions(options) {
        this.destroyOptions = options;
    }
    async destroy() {
        if (this.destroyOptions?.closeTab && this.newlyCreatedTabIds.length > 0) {
            this.onLogMessage('Closing all newly created tabs by bridge...', 'log');
            for (const tabId of this.newlyCreatedTabIds) {
                await chrome.tabs.remove(tabId);
            }
            this.newlyCreatedTabIds = [];
        }
        await super.destroy();
        if (this.bridgeClient) {
            this.bridgeClient.disconnect();
            this.bridgeClient = null;
            this.onDisconnect();
        }
    }
}
