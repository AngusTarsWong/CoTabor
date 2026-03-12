import { BaseMCPServer, createMCPServerLauncher, } from '@/shared/mcp';
import { WebMidsceneTools } from './mcp-tools';
/**
 * Web MCP Server class
 */
export class WebMCPServer extends BaseMCPServer {
    constructor(toolsManager) {
        super({
            name: '@/web/web-bridge-mcp',
            version: __VERSION__,
            description: 'Control the browser using natural language commands',
        }, toolsManager);
    }
    createToolsManager() {
        return new WebMidsceneTools();
    }
}
/**
 * Create an MCP server launcher for a specific Agent
 */
export function mcpServerForAgent(agent) {
    return createMCPServerLauncher({
        agent,
        platformName: 'Web',
        ToolsManagerClass: WebMidsceneTools,
        MCPServerClass: WebMCPServer,
    });
}
/**
 * Create MCP kit for a specific Agent
 */
export async function mcpKitForAgent(agent) {
    const toolsManager = new WebMidsceneTools();
    // Convert to AgentOverChromeBridge for Web tools manager
    const webAgent = agent;
    toolsManager.setAgent(webAgent);
    await toolsManager.initTools();
    return {
        description: 'Midscene Bridge MCP Server: Control the browser using natural language commands for navigation, clicking, input, hovering, screenshots waitFor, and achieving goals.',
        tools: toolsManager.getToolDefinitions(),
    };
}
