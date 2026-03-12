import { spawn } from 'node:child_process';
import { PLAYGROUND_SERVER_PORT } from '@/shared/constants';
import PlaygroundServer from './server';
/**
 * Create a playground launcher for a specific agent
 *
 * @example
 * ```typescript
 * import { playgroundForAgent } from '@/playground-lib';
 * import { SampleDevice, Agent } from '@/core';
 *
 * const device = new SampleDevice();
 * const agent = new Agent(device);
 *
 * // Launch playground for the agent
 * const server = await playgroundForAgent(agent).launch();
 *
 * // Launch with CORS enabled
 * const serverWithCors = await playgroundForAgent(agent).launch({
 *   enableCors: true,
 *   corsOptions: {
 *     origin: ['http://localhost:3000', 'http://localhost:8080'],
 *     credentials: true
 *   }
 * });
 *
 * // Later, when you want to shutdown:
 * server.close();
 * ```
 */
export function playgroundForAgent(agent) {
    return {
        /**
         * Launch the playground server with optional configuration
         */
        async launch(options = {}) {
            const { port = PLAYGROUND_SERVER_PORT, openBrowser = true, browserCommand, verbose = true, id, enableCors = false, corsOptions = { origin: '*', credentials: true }, } = options;
            // Extract agent components - Agent has interface property
            const webPage = agent.interface;
            if (!webPage) {
                throw new Error('Agent must have an interface property');
            }
            if (verbose) {
                console.log('🚀 Starting Midscene Playground...');
                console.log(`📱 Agent: ${agent.constructor.name}`);
                console.log(`🖥️ Page: ${webPage.constructor.name}`);
                console.log(`🌐 Port: ${port}`);
                if (enableCors) {
                    console.log('🔓 CORS enabled');
                }
            }
            // Create and launch the server with agent instance
            const server = new PlaygroundServer(agent, undefined, // staticPath - use default
            id);
            // Register CORS middleware if enabled
            /*
            if (enableCors) {
              server.app.use(cors(corsOptions));
            }
            */
            const launchedServer = await server.launch(port);
            if (verbose) {
                console.log(`✅ Playground server started on port ${port}`);
            }
            const url = `http://127.0.0.1:${port}`;
            // Open browser if requested
            if (openBrowser) {
                await openInBrowser(url, browserCommand, verbose);
            }
            return {
                server: launchedServer,
                port,
                host: '127.0.0.1',
                close: async () => {
                    if (verbose) {
                        console.log('🛑 Shutting down Midscene Playground...');
                    }
                    try {
                        await launchedServer.close();
                        if (verbose) {
                            console.log('✅ Playground shutdown complete');
                        }
                    }
                    catch (error) {
                        if (verbose) {
                            console.error('❌ Error during playground shutdown:', error);
                        }
                        throw error;
                    }
                },
            };
        },
    };
}
/**
 * Open URL in browser using platform-appropriate command
 */
async function openInBrowser(url, customCommand, verbose = true) {
    return new Promise((resolve, reject) => {
        let command;
        let args;
        if (customCommand) {
            command = customCommand;
            args = [url];
        }
        else {
            // Detect platform and use appropriate command
            switch (process.platform) {
                case 'darwin':
                    command = 'open';
                    args = [url];
                    break;
                case 'win32':
                    command = 'start';
                    args = ['', url]; // Empty string for title
                    break;
                default:
                    command = 'xdg-open';
                    args = [url];
                    break;
            }
        }
        if (verbose) {
            console.log(`🌐 Opening browser: ${command} ${args.join(' ')}`);
        }
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
        });
        child.on('error', (error) => {
            if (verbose) {
                console.warn('⚠️  Failed to open browser automatically:', error.message);
                console.log(`🌐 Please open manually: ${url}`);
            }
            // Don't reject, just continue - browser opening is optional
            resolve();
        });
        child.on('close', () => {
            resolve();
        });
        // Don't wait for the browser process
        child.unref();
    });
}
