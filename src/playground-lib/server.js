import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GroupedActionDump } from '@/core';
import { getTmpDir } from '@/core/utils';
import { PLAYGROUND_SERVER_PORT } from '@/shared/constants';
import { globalModelConfigManager, overrideAIConfig, } from '@/shared/env';
import { uuid } from '@/shared/utils';
import express from 'express';
import { executeAction, formatErrorMessage } from './common';
import dotenv from 'dotenv';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load environment variables from project root
// We assume the server is running inside packages/playground or packages/core
// and the root is a few levels up.
const rootEnvPath = path.resolve(__dirname, '../../../../.env'); // Adjust based on build structure
// If running from source (ts-node/tsx), __dirname might be src/
// If running from dist, __dirname might be dist/lib/
// Try to find .env by traversing up
let currentDir = __dirname;
let envFound = false;
for (let i = 0; i < 5; i++) {
    const envPath = path.join(currentDir, '.env');
    if (existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`[Playground Server] Loaded .env from ${envPath}`);
        envFound = true;
        break;
    }
    currentDir = path.dirname(currentDir);
}
if (!envFound) {
    console.warn('[Playground Server] .env file not found in parent directories');
}
const defaultPort = PLAYGROUND_SERVER_PORT;
// Static path for playground files
const STATIC_PATH = join(__dirname, '..', '..', 'static');
const errorHandler = (err, req, res, next) => {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({
        error: errorMessage,
    });
};
class PlaygroundServer {
    _app;
    tmpDir;
    server;
    port;
    agent;
    staticPath;
    taskExecutionDumps; // Store execution dumps directly
    id; // Unique identifier for this server instance
    _initialized = false;
    // Native MJPEG stream probe: null = not tested, true/false = result
    _nativeMjpegAvailable = null;
    // Factory function for recreating agent
    agentFactory;
    // Track current running task
    currentTaskId = null;
    // Flag to pause MJPEG polling during agent recreation or task execution
    _agentReady = true;
    // Flag to track if AI config has changed and agent needs recreation
    _configDirty = false;
    constructor(agent, staticPath = STATIC_PATH, id) {
        this._app = express();
        this.tmpDir = getTmpDir();
        this.staticPath = staticPath;
        this.taskExecutionDumps = {}; // Initialize as empty object
        // Use provided ID, or generate random UUID for each startup
        this.id = id || uuid();
        // Support both instance and factory function modes
        if (typeof agent === 'function') {
            this.agentFactory = agent;
            this.agent = null; // Will be initialized in launch()
        }
        else {
            this.agent = agent;
            this.agentFactory = null;
        }
    }
    /**
     * Get the Express app instance for custom configuration
     *
     * IMPORTANT: Add middleware (like CORS) BEFORE calling launch()
     * The routes are initialized when launch() is called, so middleware
     * added after launch() will not affect the API routes.
     *
     * @example
     * ```typescript
     * import cors from 'cors';
     *
     * const server = new PlaygroundServer(agent);
     *
     * // Add CORS middleware before launch
     * server.app.use(cors({
     *   origin: true,
     *   credentials: true,
     *   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
     * }));
     *
     * await server.launch();
     * ```
     */
    get app() {
        return this._app;
    }
    /**
     * Initialize Express app with all routes and middleware
     * Called automatically by launch() if not already initialized
     */
    initializeApp() {
        if (this._initialized)
            return;
        // Built-in middleware to parse JSON bodies
        this._app.use(express.json({ limit: '50mb' }));
        // Context update middleware (after JSON parsing)
        this._app.use((req, _res, next) => {
            const { context } = req.body || {};
            if (context &&
                'updateContext' in this.agent.interface &&
                typeof this.agent.interface.updateContext === 'function') {
                this.agent.interface.updateContext(context);
                console.log('Context updated by PlaygroundServer middleware');
            }
            next();
        });
        // NOTE: CORS middleware should be added externally via server.app.use()
        // before calling server.launch() if needed
        // API routes
        this.setupRoutes();
        // Static file serving (if staticPath is provided)
        this.setupStaticRoutes();
        // Error handler middleware (must be last)
        this._app.use(errorHandler);
        this._initialized = true;
    }
    filePathForUuid(uuid) {
        // Validate uuid to prevent path traversal attacks
        // Only allow alphanumeric characters and hyphens
        if (!/^[a-zA-Z0-9-]+$/.test(uuid)) {
            throw new Error('Invalid uuid format');
        }
        const filePath = join(this.tmpDir, `${uuid}.json`);
        // Double-check that resolved path is within tmpDir
        const resolvedPath = resolve(filePath);
        const resolvedTmpDir = resolve(this.tmpDir);
        if (!resolvedPath.startsWith(resolvedTmpDir)) {
            throw new Error('Invalid path');
        }
        return filePath;
    }
    saveContextFile(uuid, context) {
        const tmpFile = this.filePathForUuid(uuid);
        console.log(`save context file: ${tmpFile}`);
        writeFileSync(tmpFile, context);
        return tmpFile;
    }
    /**
     * Recreate agent instance (for cancellation)
     */
    async recreateAgent() {
        this._agentReady = false;
        console.log('Recreating agent to cancel current task...');
        // Destroy old agent instance
        try {
            if (this.agent && typeof this.agent.destroy === 'function') {
                await this.agent.destroy();
            }
        }
        catch (error) {
            console.warn('Failed to destroy old agent:', error);
        }
        // Create new agent instance if factory is available
        if (this.agentFactory) {
            try {
                this.agent = await this.agentFactory();
                this._agentReady = true;
                console.log('Agent recreated successfully');
            }
            catch (error) {
                this._agentReady = true;
                console.error('Failed to recreate agent:', error);
                throw error;
            }
        }
        else {
            this._agentReady = true;
            console.warn('Agent destroyed but cannot recreate: no factory function provided. Next /execute call will fail.');
        }
    }
    /**
     * Setup all API routes
     */
    setupRoutes() {
        this._app.get('/status', async (req, res) => {
            res.send({
                status: 'ok',
                id: this.id,
            });
        });
        this._app.get('/context/:uuid', async (req, res) => {
            const { uuid } = req.params;
            let contextFile;
            try {
                contextFile = this.filePathForUuid(uuid);
            }
            catch {
                return res.status(400).json({
                    error: 'Invalid uuid format',
                });
            }
            if (!existsSync(contextFile)) {
                return res.status(404).json({
                    error: 'Context not found',
                });
            }
            const context = readFileSync(contextFile, 'utf8');
            res.json({
                context,
            });
        });
        this._app.get('/task-progress/:requestId', async (req, res) => {
            const { requestId } = req.params;
            const executionDump = this.taskExecutionDumps[requestId] || null;
            res.json({
                executionDump,
            });
        });
        this._app.post('/action-space', async (req, res) => {
            try {
                let actionSpace = [];
                actionSpace = this.agent.interface.actionSpace();
                // Process actionSpace to make paramSchema serializable with shape info
                const processedActionSpace = actionSpace.map((action) => {
                    if (action && typeof action === 'object' && 'paramSchema' in action) {
                        const typedAction = action;
                        if (typedAction.paramSchema &&
                            typeof typedAction.paramSchema === 'object') {
                            // Extract shape information from Zod schema
                            let processedSchema = null;
                            try {
                                // Extract shape from runtime Zod object
                                if (typedAction.paramSchema.shape &&
                                    typeof typedAction.paramSchema.shape === 'object') {
                                    processedSchema = {
                                        type: 'ZodObject',
                                        shape: typedAction.paramSchema.shape,
                                    };
                                }
                            }
                            catch (e) {
                                const actionName = 'name' in typedAction && typeof typedAction.name === 'string'
                                    ? typedAction.name
                                    : 'unknown';
                                console.warn('Failed to process paramSchema for action:', actionName, e);
                            }
                            return {
                                ...typedAction,
                                paramSchema: processedSchema,
                            };
                        }
                    }
                    return action;
                });
                res.json(processedActionSpace);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('Failed to get action space:', error);
                res.status(500).json({
                    error: errorMessage,
                });
            }
        });
        // -------------------------
        // actions from report file
        this._app.post('/playground-with-context', async (req, res) => {
            const context = req.body.context;
            if (!context) {
                return res.status(400).json({
                    error: 'context is required',
                });
            }
            const requestId = uuid();
            this.saveContextFile(requestId, context);
            return res.json({
                location: `/playground/${requestId}`,
                uuid: requestId,
            });
        });
        this._app.post('/execute', async (req, res) => {
            const { type, prompt, params, requestId, deepLocate, deepThink, screenshotIncluded, domIncluded, deviceOptions, } = req.body;
            if (!type) {
                return res.status(400).json({
                    error: 'type is required',
                });
            }
            // Recreate agent only when AI config has changed (via /config API)
            if (this.agentFactory && this._configDirty) {
                this._configDirty = false;
                this._agentReady = false;
                console.log('AI config changed, recreating agent...');
                try {
                    if (this.agent && typeof this.agent.destroy === 'function') {
                        await this.agent.destroy();
                    }
                }
                catch (error) {
                    console.warn('Failed to destroy old agent:', error);
                }
                try {
                    this.agent = await this.agentFactory();
                    this._agentReady = true;
                    console.log('Agent recreated with new config');
                }
                catch (error) {
                    this._agentReady = true;
                    console.error('Failed to recreate agent:', error);
                    return res.status(500).json({
                        error: `Failed to create agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    });
                }
            }
            // Update device options if provided
            if (deviceOptions && this.agent.interface) {
                const iface = this.agent.interface;
                iface.options = {
                    ...(iface.options || {}),
                    ...deviceOptions,
                };
            }
            // Check if another task is running
            if (this.currentTaskId) {
                return res.status(409).json({
                    error: 'Another task is already running',
                    currentTaskId: this.currentTaskId,
                });
            }
            // Lock this task
            if (requestId) {
                this.currentTaskId = requestId;
                this.taskExecutionDumps[requestId] = null;
                // Use onDumpUpdate to receive and store executionDump directly
                this.agent.onDumpUpdate = (_dump, executionDump) => {
                    if (executionDump) {
                        // Store the execution dump directly without transformation
                        this.taskExecutionDumps[requestId] = executionDump;
                    }
                };
            }
            const response = {
                result: null,
                dump: null,
                error: null,
                reportHTML: null,
                requestId,
            };
            // Pause MJPEG polling during execution to avoid ADB contention
            this._agentReady = false;
            const startTime = Date.now();
            try {
                // Get action space to check for dynamic actions
                const actionSpace = this.agent.interface.actionSpace();
                // Prepare value object for executeAction
                const value = {
                    type,
                    prompt,
                    params,
                };
                response.result = await executeAction(this.agent, type, actionSpace, value, {
                    deepLocate,
                    deepThink,
                    screenshotIncluded,
                    domIncluded,
                    deviceOptions,
                });
            }
            catch (error) {
                response.error = formatErrorMessage(error);
            }
            try {
                const dumpString = this.agent.dumpDataString({
                    inlineScreenshots: true,
                });
                if (dumpString) {
                    const groupedDump = GroupedActionDump.fromSerializedString(dumpString);
                    // Extract first execution from grouped dump, matching local execution adapter behavior
                    response.dump = groupedDump.executions?.[0] || null;
                }
                else {
                    response.dump = null;
                }
                response.reportHTML =
                    this.agent.reportHTMLString({ inlineScreenshots: true }) || null;
                this.agent.writeOutActionDumps();
                this.agent.resetDump();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`write out dump failed: requestId: ${requestId}, ${errorMessage}`);
            }
            finally {
                // Resume MJPEG polling after execution
                this._agentReady = true;
            }
            res.send(response);
            const timeCost = Date.now() - startTime;
            if (response.error) {
                console.error(`handle request failed after ${timeCost}ms: requestId: ${requestId}, ${response.error}`);
            }
            else {
                console.log(`handle request done after ${timeCost}ms: requestId: ${requestId}`);
            }
            // Clean up task execution dumps and unlock after execution completes
            if (requestId) {
                delete this.taskExecutionDumps[requestId];
                // Release the lock
                if (this.currentTaskId === requestId) {
                    this.currentTaskId = null;
                }
            }
        });
        this._app.post('/cancel/:requestId', async (req, res) => {
            const { requestId } = req.params;
            if (!requestId) {
                return res.status(400).json({
                    error: 'requestId is required',
                });
            }
            try {
                // Check if this is the current running task
                if (this.currentTaskId !== requestId) {
                    return res.json({
                        status: 'not_found',
                        message: 'Task not found or already completed',
                    });
                }
                console.log(`Cancelling task: ${requestId}`);
                // Get current execution data before cancelling (dump and reportHTML)
                let dump = null;
                let reportHTML = null;
                try {
                    const dumpString = this.agent.dumpDataString?.({
                        inlineScreenshots: true,
                    });
                    if (dumpString) {
                        const groupedDump = GroupedActionDump.fromSerializedString(dumpString);
                        // Extract first execution from grouped dump
                        dump = groupedDump.executions?.[0] || null;
                    }
                    reportHTML =
                        this.agent.reportHTMLString?.({ inlineScreenshots: true }) ||
                            null;
                }
                catch (error) {
                    console.warn('Failed to get execution data before cancel:', error);
                }
                // Destroy and recreate agent to cancel the current task
                try {
                    await this.recreateAgent();
                }
                catch (error) {
                    console.warn('Failed to recreate agent during cancel:', error);
                }
                // Clean up
                delete this.taskExecutionDumps[requestId];
                this.currentTaskId = null;
                res.json({
                    status: 'cancelled',
                    message: 'Task cancelled successfully',
                    dump,
                    reportHTML,
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to cancel: ${errorMessage}`);
                res.status(500).json({
                    error: `Failed to cancel: ${errorMessage}`,
                });
            }
        });
        // Screenshot API for real-time screenshot polling
        this._app.get('/screenshot', async (_req, res) => {
            try {
                // Check if page has screenshotBase64 method
                if (typeof this.agent.interface.screenshotBase64 !== 'function') {
                    return res.status(500).json({
                        error: 'Screenshot method not available on current interface',
                    });
                }
                const base64Screenshot = await this.agent.interface.screenshotBase64();
                res.json({
                    screenshot: base64Screenshot,
                    timestamp: Date.now(),
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to take screenshot: ${errorMessage}`);
                res.status(500).json({
                    error: `Failed to take screenshot: ${errorMessage}`,
                });
            }
        });
        // MJPEG streaming endpoint for real-time screen preview
        // Proxies native MJPEG stream (e.g. WDA MJPEG server) when available,
        // falls back to polling screenshotBase64() otherwise.
        this._app.get('/mjpeg', async (req, res) => {
            const nativeUrl = this.agent?.interface?.mjpegStreamUrl;
            if (nativeUrl && this._nativeMjpegAvailable !== false) {
                const proxyOk = await this.probeAndProxyNativeMjpeg(nativeUrl, req, res);
                if (proxyOk)
                    return;
            }
            if (typeof this.agent?.interface?.screenshotBase64 !== 'function') {
                return res.status(500).json({
                    error: 'Screenshot method not available on current interface',
                });
            }
            await this.startPollingMjpegStream(req, res);
        });
        // Interface info API for getting interface type and description
        this._app.get('/interface-info', async (_req, res) => {
            try {
                const type = this.agent.interface.interfaceType || 'Unknown';
                const description = this.agent.interface.describe?.() || undefined;
                res.json({
                    type,
                    description,
                });
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to get interface info: ${errorMessage}`);
                res.status(500).json({
                    error: `Failed to get interface info: ${errorMessage}`,
                });
            }
        });
        this.app.post('/config', async (req, res) => {
            const { aiConfig } = req.body;
            if (!aiConfig || typeof aiConfig !== 'object') {
                return res.status(400).json({
                    error: 'aiConfig is required and must be an object',
                });
            }
            if (Object.keys(aiConfig).length === 0) {
                return res.json({
                    status: 'ok',
                    message: 'AI config not changed due to empty object',
                });
            }
            try {
                overrideAIConfig(aiConfig);
                this._configDirty = true;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Failed to update AI config: ${errorMessage}`);
                return res.status(500).json({
                    error: `Failed to update AI config: ${errorMessage}`,
                });
            }
            // Validate the config immediately so the frontend gets early feedback
            try {
                globalModelConfigManager.getModelConfig('default');
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`AI config validation failed: ${errorMessage}`);
                return res.status(400).json({
                    error: errorMessage,
                });
            }
            // Note: Agent will be recreated on next execution to apply new config
            return res.json({
                status: 'ok',
                message: 'AI config updated. Agent will be recreated on next execution.',
            });
        });
    }
    /**
     * Probe and proxy a native MJPEG stream (e.g. WDA MJPEG server).
     * Result is cached so we only probe once per server lifetime.
     */
    probeAndProxyNativeMjpeg(nativeUrl, req, res) {
        return new Promise((resolve) => {
            console.log(`MJPEG: trying native stream from ${nativeUrl}`);
            const proxyReq = http.get(nativeUrl, (proxyRes) => {
                this._nativeMjpegAvailable = true;
                console.log('MJPEG: streaming via native WDA MJPEG server');
                const contentType = proxyRes.headers['content-type'];
                if (contentType) {
                    res.setHeader('Content-Type', contentType);
                }
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Connection', 'keep-alive');
                proxyRes.pipe(res);
                req.on('close', () => proxyReq.destroy());
                resolve(true);
            });
            proxyReq.on('error', (err) => {
                this._nativeMjpegAvailable = false;
                console.warn(`MJPEG: native stream unavailable (${err.message}), using polling mode`);
                resolve(false);
            });
        });
    }
    /**
     * Stream screenshots as MJPEG by polling screenshotBase64().
     */
    async startPollingMjpegStream(req, res) {
        const defaultMjpegFps = 10;
        const maxMjpegFps = 30;
        const maxErrorBackoffMs = 3000;
        const errorLogThreshold = 3;
        const parsedFps = Number(req.query.fps);
        const fps = Math.min(Math.max(Number.isNaN(parsedFps) ? defaultMjpegFps : parsedFps, 1), maxMjpegFps);
        const interval = Math.round(1000 / fps);
        const boundary = 'mjpeg-boundary';
        console.log(`MJPEG: streaming via polling mode (${fps}fps)`);
        res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${boundary}`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Connection', 'keep-alive');
        let stopped = false;
        let consecutiveErrors = 0;
        req.on('close', () => {
            stopped = true;
        });
        while (!stopped) {
            // Skip frame while agent is being recreated
            if (!this._agentReady) {
                await new Promise((r) => setTimeout(r, 200));
                continue;
            }
            const frameStart = Date.now();
            try {
                const base64 = await this.agent.interface.screenshotBase64();
                if (stopped)
                    break;
                consecutiveErrors = 0;
                const raw = base64.replace(/^data:image\/\w+;base64,/, '');
                const buf = Buffer.from(raw, 'base64');
                res.write(`--${boundary}\r\n`);
                res.write('Content-Type: image/jpeg\r\n');
                res.write(`Content-Length: ${buf.length}\r\n\r\n`);
                res.write(buf);
                res.write('\r\n');
            }
            catch (err) {
                if (stopped)
                    break;
                consecutiveErrors++;
                if (consecutiveErrors <= errorLogThreshold) {
                    console.error('MJPEG frame error:', err);
                }
                else if (consecutiveErrors === errorLogThreshold + 1) {
                    console.error('MJPEG: suppressing further errors, retrying silently...');
                }
                const backoff = Math.min(1000 * consecutiveErrors, maxErrorBackoffMs);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
            }
            const elapsed = Date.now() - frameStart;
            const remaining = interval - elapsed;
            if (remaining > 0) {
                await new Promise((r) => setTimeout(r, remaining));
            }
        }
    }
    /**
     * Setup static file serving routes
     */
    setupStaticRoutes() {
        // Handle index.html with port injection
        this._app.get('/', (_req, res) => {
            this.serveHtmlWithPorts(res);
        });
        this._app.get('/index.html', (_req, res) => {
            this.serveHtmlWithPorts(res);
        });
        // Use express.static middleware for secure static file serving
        this._app.use(express.static(this.staticPath));
        // Fallback to index.html for SPA routing
        this._app.get('*', (_req, res) => {
            this.serveHtmlWithPorts(res);
        });
    }
    /**
     * Serve HTML with injected port configuration
     */
    serveHtmlWithPorts(res) {
        try {
            const htmlPath = join(this.staticPath, 'index.html');
            let html = readFileSync(htmlPath, 'utf8');
            // Get scrcpy server port from global
            const scrcpyPort = global.scrcpyServerPort || this.port + 1;
            // Inject scrcpy port configuration script into HTML head
            const configScript = `
        <script>
          window.SCRCPY_PORT = ${scrcpyPort};
        </script>
      `;
            // Insert the script before closing </head> tag
            html = html.replace('</head>', `${configScript}</head>`);
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        }
        catch (error) {
            console.error('Error serving HTML with ports:', error);
            res.status(500).send('Internal Server Error');
        }
    }
    /**
     * Launch the server on specified port
     */
    async launch(options = {}) {
        if (this._initialized) {
            console.warn('PlaygroundServer is already initialized');
            return this;
        }
        // Initialize agent if factory is provided
        if (this.agentFactory) {
            console.log('Initializing agent from factory function...');
            this.agent = await this.agentFactory();
            console.log('Agent initialized successfully');
        }
        const config = typeof options === 'number' ? { port: options } : options;
        const { port = defaultPort, openBrowser = false, verbose = false } = config;
        // Initialize routes now, after any middleware has been added
        this.initializeApp();
        return new Promise((resolve, reject) => {
            const serverPort = port || defaultPort;
            this.server = this._app.listen(serverPort, () => {
                this.port = serverPort;
                const url = `http://localhost:${serverPort}`;
                if (verbose) {
                    console.log(`Playground Server is running at ${url}`);
                }
                if (openBrowser) {
                    import('open').then((open) => {
                        open.default(url).catch((err) => {
                            console.error('Failed to open browser:', err);
                        });
                    });
                }
                resolve(this);
            });
            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }
    /**
     * Close the server and clean up resources
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.server) {
                // Clean up the single agent
                try {
                    this.agent.destroy();
                }
                catch (error) {
                    console.warn('Failed to destroy agent:', error);
                }
                this.taskExecutionDumps = {};
                // Close the server
                this.server.close((error) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        this.server = undefined;
                        resolve();
                    }
                });
            }
            else {
                resolve();
            }
        });
    }
}
export default PlaygroundServer;
export { PlaygroundServer };
