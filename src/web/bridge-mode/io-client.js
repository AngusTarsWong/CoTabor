import { assert } from '@/shared/utils';
import { io as ClientIO } from 'socket.io-client';
import { BridgeEvent, } from './common';
// ws client, this is where the request is processed
export class BridgeClient {
    endpoint;
    onBridgeCall;
    onDisconnect;
    socket = null;
    serverVersion = null;
    constructor(endpoint, onBridgeCall, onDisconnect) {
        this.endpoint = endpoint;
        this.onBridgeCall = onBridgeCall;
        this.onDisconnect = onDisconnect;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            // Force WebSocket if XMLHttpRequest is not available (e.g., Service Worker)
            const forceWebSocket = typeof XMLHttpRequest === 'undefined';
            this.socket = ClientIO(this.endpoint, {
                reconnection: false,
                // Force WebSocket in environments without XHR (Service Worker)
                ...(forceWebSocket ? { transports: ['websocket'] } : {}),
                query: {
                    version: __VERSION__,
                },
            });
            const timeout = setTimeout(() => {
                try {
                    this.socket?.offAny();
                    this.socket?.close();
                }
                catch (e) {
                    console.warn('got error when offing socket', e);
                }
                this.socket = null;
                reject(new Error('failed to connect to bridge server after timeout'));
            }, 5 * 1000);
            // on disconnect
            this.socket.on('disconnect', (reason) => {
                // console.log('bridge-disconnected, reason:', reason);
                this.socket = null;
                this.onDisconnect?.();
            });
            this.socket.on('connect_error', (e) => {
                console.error('bridge-connect-error', e);
                reject(new Error(e || 'bridge connect error'));
            });
            this.socket.on(BridgeEvent.Connected, (payload) => {
                clearTimeout(timeout);
                this.serverVersion = payload?.version || 'unknown';
                resolve(this.socket);
            });
            this.socket.on(BridgeEvent.Refused, (e) => {
                console.error('bridge-refused', e);
                try {
                    this.socket?.disconnect();
                }
                catch (e) {
                    // console.warn('got error when disconnecting socket', e);
                }
                reject(new Error(e || 'bridge refused'));
            });
            this.socket.on(BridgeEvent.Call, (call) => {
                const id = call.id;
                assert(typeof id !== 'undefined', 'call id is required');
                (async () => {
                    let response;
                    try {
                        response = await this.onBridgeCall(call.method, call.args);
                    }
                    catch (e) {
                        const errorContent = `Error from bridge client when calling, method: ${call.method}, args: ${call.args}, error: ${e?.message || e}\n${e?.stack || ''}`;
                        console.error(errorContent);
                        return this.socket?.emit(BridgeEvent.CallResponse, {
                            id,
                            error: errorContent,
                        });
                    }
                    this.socket?.emit(BridgeEvent.CallResponse, {
                        id,
                        response,
                    });
                })();
            });
        });
    }
    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
    }
}
