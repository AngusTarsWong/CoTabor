import { Skill } from "../types";
import { McpSkillAdapter } from "./mcp-adapter";

// UserSkillLoader: Responsible for loading skills from user configurations
export class UserSkillLoader {
  
  // Load skills from user configuration
  static async loadSkills(): Promise<Skill[]> {
    console.log("[UserSkillLoader] Checking for user-defined skills...");
    const skills: Skill[] = [];
    
    // 1. Load Mock Skills (for demonstration/testing)
    skills.push(UserSkillLoader.getMockSkill());

    // 2. Load MCP Skills (if configured)
    // In a real app, we would read this from a config file or user settings
    const mcpServers: { command: string, args: string[] }[] = [
      {
        command: "npx",
        args: ["tsx", "/Users/angus/code/pycharm_code/CoTabor/src/skills/user/mcp-servers/stock-mcp.ts"]
      }
    ];

    for (const serverConfig of mcpServers) {
        try {
            console.log(`[UserSkillLoader] Connecting to MCP server: ${serverConfig.command} ${serverConfig.args.join(" ")}`);
            const adapter = new McpSkillAdapter(serverConfig.command, serverConfig.args);
            await adapter.connect();
            const mcpSkills = await adapter.listSkills();
            console.log(`[UserSkillLoader] Loaded ${mcpSkills.length} skills from MCP server.`);
            skills.push(...mcpSkills);
        } catch (e) {
            console.error(`[UserSkillLoader] Failed to load MCP skills from ${serverConfig.command}:`, e);
        }
    }

    return skills;
  }

  private static getMockSkill(): Skill {
    return {
      name: "search_local_files",
      description: "Search for files in the user's local workspace matching a query.",
      role: "query",
      type: "mcp", // Using 'mcp' type to indicate external/user origin
      params: {
        query: "string - The filename or pattern to search for",
        path: "string - (Optional) The root directory to search in"
      },
      
      async execute(params: any, context?: any) {
        console.log(`[UserSkill: search_local_files] Searching for '${params.query}'...`);
        // Mock result
        return {
          status: "SUCCESS",
          files: [
            "/Users/angus/code/project/README.md",
            "/Users/angus/code/project/src/main.ts"
          ]
        };
      },

      async getManual() {
        return `
# Skill: Search Local Files
Use this skill when the user asks to find files on their local machine.
Returns a list of absolute file paths.
        `;
      }
    };
  }
}