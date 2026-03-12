import { Agent } from '@/core/agent';
import { assert } from '@/shared/utils';
import { commonWebActionsForWebPage } from '../web-page';
import { BridgeEvent, BridgePageType, DefaultBridgeServerHost, DefaultBridgeServerPort, KeyboardEvent, MouseEvent, getBridgeServerHost, } from './common';
import { BridgeServer } from './io-server';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// actually, this is a proxy to the page in browser side
export const getBridgePageInCliSide = (options) => {
    const host = options?.host || DefaultBridgeServerHost;
    const port = options?.port || DefaultBridgeServerPort;
    const server = new BridgeServer(host, port, undefined, undefined, options?.closeConflictServer);
    server.listen({
        timeout: options?.timeout,
    });
    const bridgeCaller = (method, timeout) => {
        return async (...args) => {
            const response = await server.call(method, args, timeout);
            return response;
        };
    };
    const page = {
        showStatusMessage: async (message) => {
            await server.call(BridgeEvent.UpdateAgentStatus, [message]);
        },
    };
    const proxyPage = new Proxy(page, {
        get(target, prop, receiver) {
            assert(typeof prop === 'string', 'prop must be a string');
            if (prop === 'toJSON') {
                return () => {
                    return {
                        interfaceType: BridgePageType,
                    };
                };
            }
            if (prop === 'interfaceType') {
                return BridgePageType;
            }
            if (prop === 'actionSpace') {
                return () => commonWebActionsForWebPage(proxyPage);
            }
            if (Object.keys(page).includes(prop)) {
                return page[prop];
            }
            if (prop === 'mouse') {
                const mouse = {
                    click: bridgeCaller(MouseEvent.Click),
                    wheel: bridgeCaller(MouseEvent.Wheel),
                    move: bridgeCaller(MouseEvent.Move),
                    drag: bridgeCaller(MouseEvent.Drag),
                };
                return mouse;
            }
            if (prop === 'keyboard') {
                const keyboard = {
                    type: bridgeCaller(KeyboardEvent.Type),
                    press: bridgeCaller(KeyboardEvent.Press),
                };
                return keyboard;
            }
            if (prop === 'destroy') {
                return async (...args) => {
                    try {
                        const caller = bridgeCaller('destroy');
                        await caller(...args);
                    }
                    catch (e) {
                        // console.error('error calling destroy', e);
                    }
                    return server.close();
                };
            }
            // Special handling for methods that support timeout in options
            if (prop === 'connectNewTabWithUrl') {
                return async (url, options) => {
                    const timeout = options?.timeout;
                    const caller = bridgeCaller(prop, timeout);
                    return await caller(url, options);
                };
            }
            if (prop === 'connectCurrentTab') {
                return async (options) => {
                    const timeout = options?.timeout;
                    const caller = bridgeCaller(prop, timeout);
                    return await caller(options);
                };
            }
            return bridgeCaller(prop);
        },
    });
    return proxyPage;
};
export class AgentOverChromeBridge extends Agent {
    destroyAfterDisconnectFlag;
    constructor(opts) {
        const host = getBridgeServerHost({
            host: opts?.host,
            allowRemoteAccess: opts?.allowRemoteAccess,
        });
        const page = getBridgePageInCliSide({
            host,
            port: opts?.port,
            timeout: opts?.serverListeningTimeout,
            closeConflictServer: opts?.closeConflictServer,
        });
        const originalOnTaskStartTip = opts?.onTaskStartTip;
        super(page, Object.assign(opts || {}, {
            onTaskStartTip: (tip) => {
                this.page.showStatusMessage(tip);
                if (originalOnTaskStartTip) {
                    originalOnTaskStartTip?.call(this, tip);
                }
            },
        }));
        this.destroyAfterDisconnectFlag = opts?.closeNewTabsAfterDisconnect;
    }
    async setDestroyOptionsAfterConnect() {
        if (this.destroyAfterDisconnectFlag) {
            this.page.setDestroyOptions({
                closeTab: true,
            });
        }
    }
    async connectNewTabWithUrl(url, options) {
        await this.page.connectNewTabWithUrl(url, options);
        await sleep(500);
        await this.setDestroyOptionsAfterConnect();
    }
    async getBrowserTabList() {
        return await this.page.getBrowserTabList();
    }
    async setActiveTabId(tabId) {
        return await this.page.setActiveTabId(Number.parseInt(tabId));
    }
    async connectCurrentTab(options) {
        await this.page.connectCurrentTab(options);
        await sleep(500);
        await this.setDestroyOptionsAfterConnect();
    }
    async aiAct(prompt, options) {
        if (options) {
            console.warn('the `options` parameter of aiAct is not supported in cli side');
        }
        return await super.aiAct(prompt);
    }
    async destroy(closeNewTabsAfterDisconnect) {
        if (typeof closeNewTabsAfterDisconnect === 'boolean') {
            await this.page.setDestroyOptions({
                closeTab: closeNewTabsAfterDisconnect,
            });
        }
        await super.destroy();
    }
}
