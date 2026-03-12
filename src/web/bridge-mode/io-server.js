import { createServer } from 'node:http';
import { sleep } from '@/core/utils';
import { logMsg } from '@/shared/utils';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { BridgeCallTimeout, BridgeErrorCodeNoClientConnected, BridgeEvent, BridgeSignalKill, DefaultBridgeServerPort, } from './common';
export const killRunningServer = async (port, host = 'localhost') => {
    try {
        const client = ClientIO(`ws://${host}:${port || DefaultBridgeServerPort}`, {
            query: {
                [BridgeSignalKill]: 1,
            },
        });
        await sleep(100);
        await client.close();
    }
    catch (e) {
        // console.error('failed to kill port', e);
    }
};
// ws server, this is where the request is sent
export class BridgeServer {
    host;
    port;
    onConnect;
    onDisconnect;
    closeConflictServer;
    callId = 0;
    io = null;
    socket = null;
    listeningTimeoutId = null;
    listeningTimerFlag = false;
    connectionTipTimer = null;
    calls = {};
    connectionLost = false;
    connectionLostReason = '';
    constructor(host, port, onConnect, onDisconnect, closeConflictServer) {
        this.host = host;
        this.port = port;
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        this.closeConflictServer = closeConflictServer;
    }
    async listen(opts = {}) {
        const { timeout = 30000 } = opts;
        if (this.closeConflictServer) {
            await killRunningServer(this.port, this.host);
        }
        return new Promise((resolve, reject) => {
            if (this.listeningTimerFlag) {
                return reject(new Error('already listening'));
            }
            this.listeningTimerFlag = true;
            this.listeningTimeoutId = timeout
                ? setTimeout(() => {
                    reject(new Error(`no extension connected after ${timeout}ms (${BridgeErrorCodeNoClientConnected})`));
                }, timeout)
                : null;
            this.connectionTipTimer =
                !timeout || timeout > 3000
                    ? setTimeout(() => {
                        logMsg('waiting for bridge to connect...');
                    }, 2000)
                    : null;
            // Create HTTP server and start listening on the specified host and port
            const httpServer = createServer();
            // Set up HTTP server event listeners FIRST
            httpServer.once('listening', () => {
                resolve();
            });
            httpServer.once('error', (err) => {
                reject(new Error(`Bridge Listening Error: ${err.message}`));
            });
            // Start listening BEFORE creating Socket.IO Server
            // When host is 127.0.0.1 (default), don't specify host to listen on all local interfaces (IPv4 + IPv6)
            // This ensures localhost resolves correctly in both IPv4 and IPv6 environments
            if (this.host === '127.0.0.1') {
                httpServer.listen(this.port);
            }
            else {
                httpServer.listen(this.port, this.host);
            }
            // Now create Socket.IO Server attached to the already-listening HTTP server
            this.io = new Server(httpServer, {
                maxHttpBufferSize: 100 * 1024 * 1024, // 100MB
            });
            this.io.use((socket, next) => {
                if (this.socket) {
                    next(new Error('server already connected by another client'));
                }
                next();
            });
            this.io.on('connection', (socket) => {
                // check the connection url
                const url = socket.handshake.url;
                if (url.includes(BridgeSignalKill)) {
                    console.warn('kill signal received, closing bridge server');
                    return this.close();
                }
                this.connectionLost = false;
                this.connectionLostReason = '';
                this.listeningTimeoutId && clearTimeout(this.listeningTimeoutId);
                this.listeningTimeoutId = null;
                this.connectionTipTimer && clearTimeout(this.connectionTipTimer);
                this.connectionTipTimer = null;
                if (this.socket) {
                    socket.emit(BridgeEvent.Refused);
                    // close the socket
                    socket.disconnect();
                    return reject(new Error('server already connected by another client'));
                }
                try {
                    logMsg('one client connected');
                    this.socket = socket;
                    const clientVersion = socket.handshake.query.version;
                    logMsg(`Bridge connected, cli-side version v${__VERSION__}, browser-side version v${clientVersion}`);
                    socket.on(BridgeEvent.CallResponse, (params) => {
                        const id = params.id;
                        const response = params.response;
                        const error = params.error;
                        this.triggerCallResponseCallback(id, error, response);
                    });
                    socket.on('disconnect', (reason) => {
                        this.connectionLost = true;
                        this.connectionLostReason = reason;
                        try {
                            this.io?.close();
                        }
                        catch (e) {
                            // ignore
                        }
                        // flush all pending calls as error
                        for (const id in this.calls) {
                            const call = this.calls[id];
                            if (!call.responseTime) {
                                const errorMessage = this.connectionLostErrorMsg();
                                this.triggerCallResponseCallback(id, new Error(errorMessage), null);
                            }
                        }
                        this.onDisconnect?.(reason);
                    });
                    setTimeout(() => {
                        this.onConnect?.();
                        const payload = {
                            version: __VERSION__,
                        };
                        socket.emit(BridgeEvent.Connected, payload);
                        Promise.resolve().then(() => {
                            for (const id in this.calls) {
                                if (this.calls[id].callTime === 0) {
                                    this.emitCall(id);
                                }
                            }
                        });
                    }, 0);
                }
                catch (e) {
                    console.error('failed to handle connection event', e);
                    reject(e);
                }
            });
            this.io.on('close', () => {
                this.close();
            });
        });
    }
    connectionLostErrorMsg = () => {
        return `Connection lost, reason: ${this.connectionLostReason}`;
    };
    async triggerCallResponseCallback(id, error, response) {
        const call = this.calls[id];
        if (!call) {
            throw new Error(`call ${id} not found`);
        }
        call.error = error || undefined;
        call.response = response;
        call.responseTime = Date.now();
        call.callback(call.error, response);
    }
    async emitCall(id) {
        const call = this.calls[id];
        if (!call) {
            throw new Error(`call ${id} not found`);
        }
        if (this.connectionLost) {
            const message = `Connection lost, reason: ${this.connectionLostReason}`;
            call.callback(new Error(message), null);
            return;
        }
        if (this.socket) {
            this.socket.emit(BridgeEvent.Call, {
                id,
                method: call.method,
                args: call.args,
            });
            call.callTime = Date.now();
        }
    }
    async call(method, args, timeout = BridgeCallTimeout) {
        const id = `${this.callId++}`;
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                logMsg(`bridge call timeout, id=${id}, method=${method}, args=`, args);
                this.calls[id].error = new Error(`Bridge call timeout after ${timeout}ms: ${method}`);
                reject(this.calls[id].error);
            }, timeout);
            this.calls[id] = {
                method,
                args,
                response: null,
                callTime: 0,
                responseTime: 0,
                callback: (error, response) => {
                    clearTimeout(timeoutId);
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(response);
                    }
                },
            };
            this.emitCall(id);
        });
    }
    // do NOT restart after close
    async close() {
        this.listeningTimeoutId && clearTimeout(this.listeningTimeoutId);
        this.connectionTipTimer && clearTimeout(this.connectionTipTimer);
        const closeProcess = this.io?.close();
        this.io = null;
        return closeProcess;
    }
}
