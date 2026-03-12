import { parseBase64 } from '@/shared/img';
import { getDebug } from '@/shared/logger';
import { generateCommonTools, generateToolsFromActionSpace, } from './tool-generator';
const debug = getDebug('mcp:base-tools');
/**
 * Base class for platform-specific MCP tools
 * Generic type TAgent allows subclasses to use their specific agent types
 */
export class BaseMidsceneTools {
    mcpServer;
    agent;
    toolDefinitions = [];
    /**
     * Optional: prepare platform-specific tools (e.g., device connection)
     */
    preparePlatformTools() {
        return [];
    }
    /**
     * Initialize all tools by querying actionSpace
     * Uses two-layer fallback strategy:
     * 1. Try to get actionSpace from connected agent (if available)
     * 2. Create temporary device instance to read actionSpace (always succeeds)
     */
    async initTools() {
        this.toolDefinitions = [];
        // 1. Add platform-specific tools first (device connection, etc.)
        // These don't require an agent and should always be available
        const platformTools = this.preparePlatformTools();
        this.toolDefinitions.push(...platformTools);
        // 2. Get action space: use pre-set agent if available, otherwise temp device.
        //    When called via mcpKitForAgent(), agent is set before initTools().
        //    For CLI usage, agent is deferred to the first real command.
        let actionSpace;
        if (this.agent) {
            actionSpace = await this.agent.getActionSpace();
            debug('Action space from agent:', actionSpace.map((a) => a.name).join(', '));
        }
        else {
            const tempDevice = this.createTemporaryDevice();
            actionSpace = tempDevice.actionSpace();
            await tempDevice.destroy?.();
            debug('Action space from temporary device:', actionSpace.map((a) => a.name).join(', '));
        }
        // 3. Generate tools from action space (core innovation)
        const actionTools = generateToolsFromActionSpace(actionSpace, () => this.ensureAgent());
        // 4. Add common tools (screenshot, waitFor)
        const commonTools = generateCommonTools(() => this.ensureAgent());
        this.toolDefinitions.push(...actionTools, ...commonTools);
        debug('Total tools prepared:', this.toolDefinitions.length);
    }
    /**
     * Attach to MCP server and register all tools
     */
    attachToServer(server) {
        this.mcpServer = server;
        if (this.toolDefinitions.length === 0) {
            debug('Warning: No tools to register. Tools may be initialized lazily.');
        }
        for (const toolDef of this.toolDefinitions) {
            this.mcpServer.tool(toolDef.name, toolDef.description, toolDef.schema, toolDef.handler);
        }
        debug('Registered', this.toolDefinitions.length, 'tools');
    }
    /**
     * Cleanup method - destroy agent and release resources
     */
    async destroy() {
        await this.agent?.destroy?.();
    }
    /**
     * Get tool definitions
     */
    getToolDefinitions() {
        return this.toolDefinitions;
    }
    /**
     * Set agent for the tools manager
     */
    setAgent(agent) {
        this.agent = agent;
    }
    /**
     * Helper: Convert base64 screenshot to image content array
     */
    buildScreenshotContent(screenshot) {
        const { mimeType, body } = parseBase64(screenshot);
        return [
            {
                type: 'image',
                data: body,
                mimeType,
            },
        ];
    }
    /**
     * Helper: Build a simple text result for tool responses
     */
    buildTextResult(text) {
        return {
            content: [{ type: 'text', text }],
        };
    }
    /**
     * Create a disconnect handler for releasing platform resources
     * @param platformName Human-readable platform name for the response message
     * @returns Handler function that destroys the agent and returns appropriate response
     */
    createDisconnectHandler(platformName) {
        return async () => {
            if (!this.agent) {
                return this.buildTextResult('No active connection to disconnect');
            }
            try {
                await this.agent.destroy?.();
            }
            catch (error) {
                debug('Failed to destroy agent during disconnect:', error);
            }
            this.agent = undefined;
            return this.buildTextResult(`Disconnected from ${platformName}`);
        };
    }
}
