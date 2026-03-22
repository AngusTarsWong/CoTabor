import { Skill } from "../types";
import { McpSkillAdapter } from "./mcp-adapter";
import * as fs from "fs";
import * as path from "path";

// UserSkillLoader: Responsible for loading skills from user configurations
export class UserSkillLoader {
  
  // Load skills from user configuration
  static async loadSkills(): Promise<Skill[]> {
    console.log("[UserSkillLoader] Checking for user-defined skills...");
    const skills: Skill[] = [];
    
    // 1. Load Mock Skills (for demonstration/testing)
    skills.push(UserSkillLoader.getMockSkill());

    // 2. Load MCP Skills from config
    const mcpServers = this.readMcpConfig();

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

  private static readMcpConfig(): { command: string, args: string[] }[] {
    const configPath = path.resolve(process.cwd(), "mcp.config.json");
    try {
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(fileContent);
        if (config.mcpServers) {
          return Object.values(config.mcpServers);
        }
      }
    } catch (e) {
      console.error("[UserSkillLoader] Failed to read mcp.config.json:", e);
    }
    
    // Fallback if no config found
    return [
      {
        command: "npx",
        args: ["tsx", path.resolve(process.cwd(), "src/skills/user/mcp-servers/stock-mcp.ts")]
      }
    ];
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