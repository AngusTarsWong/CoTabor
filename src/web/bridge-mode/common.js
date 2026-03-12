export const DefaultBridgeServerHost = '127.0.0.1';
export const DefaultBridgeServerPort = 3766;
export const DefaultLocalEndpoint = `http://${DefaultBridgeServerHost}:${DefaultBridgeServerPort}`;
export const BridgeCallTimeout = 30000;
/**
 * Get the server host based on configuration options.
 * Priority: explicit host > allowRemoteAccess > default (127.0.0.1)
 */
export function getBridgeServerHost(options) {
    if (options?.host) {
        return options.host;
    }
    if (options?.allowRemoteAccess) {
        return '0.0.0.0';
    }
    return DefaultBridgeServerHost;
}
export var BridgeEvent;
(function (BridgeEvent) {
    BridgeEvent["Call"] = "bridge-call";
    BridgeEvent["CallResponse"] = "bridge-call-response";
    BridgeEvent["UpdateAgentStatus"] = "bridge-update-agent-status";
    BridgeEvent["Message"] = "bridge-message";
    BridgeEvent["Connected"] = "bridge-connected";
    BridgeEvent["Refused"] = "bridge-refused";
    BridgeEvent["ConnectNewTabWithUrl"] = "connectNewTabWithUrl";
    BridgeEvent["ConnectCurrentTab"] = "connectCurrentTab";
    BridgeEvent["GetBrowserTabList"] = "getBrowserTabList";
    BridgeEvent["SetDestroyOptions"] = "setDestroyOptions";
    BridgeEvent["SetActiveTabId"] = "setActiveTabId";
})(BridgeEvent || (BridgeEvent = {}));
export const BridgeSignalKill = 'MIDSCENE_BRIDGE_SIGNAL_KILL';
export var MouseEvent;
(function (MouseEvent) {
    MouseEvent["PREFIX"] = "mouse.";
    MouseEvent["Click"] = "mouse.click";
    MouseEvent["Wheel"] = "mouse.wheel";
    MouseEvent["Move"] = "mouse.move";
    MouseEvent["Drag"] = "mouse.drag";
})(MouseEvent || (MouseEvent = {}));
export var KeyboardEvent;
(function (KeyboardEvent) {
    KeyboardEvent["PREFIX"] = "keyboard.";
    KeyboardEvent["Type"] = "keyboard.type";
    KeyboardEvent["Press"] = "keyboard.press";
})(KeyboardEvent || (KeyboardEvent = {}));
export const BridgePageType = 'page-over-chrome-extension-bridge';
export const BridgeErrorCodeNoClientConnected = 'no-client-connected';
