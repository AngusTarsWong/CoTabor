import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Skill, SkillRole } from "../types";

export class McpSkillAdapter {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(command: string, args: string[]) {
    this.transport = new StdioClientTransport({
      command,
      args,
    });
    this.client = new Client(
      {
        name: "CoTabor-McpClient",
        version: "1.0.0",
      },
      {
        capabilities: {
          // tools: {}, // Removed incorrect capability key
        },
      }
    );
  }

  async connect() {
    await this.client.connect(this.transport);
    console.log("[McpSkillAdapter] Connected to MCP Server.");
  }

  async listSkills(): Promise<Skill[]> {
    const response = await this.client.listTools();
    const tools = response.tools;
    
    return tools.map(tool => {
      // Determine role based on tool name/description (heuristic)
      let role: SkillRole = "action";
      if (tool.name.includes("get") || tool.name.includes("read") || tool.name.includes("search")) {
        role = "query";
      }

      const skill: Skill = {
        name: tool.name,
        description: tool.description || "No description provided.",
        role: role,
        type: "mcp",
        params: tool.inputSchema as any, // Schema mapping needs refinement in production
        execute: async (params: any) => {
          console.log(`[McpSkill] Executing ${tool.name} with params:`, params);
          const result = await this.client.callTool({
            name: tool.name,
            arguments: params,
          });
          return result;
        },
        getManual: async () => {
          return `
# Skill: ${tool.name}
${tool.description || "No description provided."}

Parameters:
${JSON.stringify(tool.inputSchema, null, 2)}
          `;
        }
      };
      
      return skill;
    });
  }
}