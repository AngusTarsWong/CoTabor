import { Skill } from "../types";
import { McpSkillAdapter, McpServerConfig } from "./mcp-adapter";
import { loadBuiltInMcpSkills } from "../bundled/mcp-builtin";

/**
 * Persisted format in chrome.storage.local under the key "mcpServers".
 * Compatible with Claude Desktop's mcpServers config schema.
 *
 * Example:
 * {
 *   "github": { "url": "https://api.githubcopilot.com/mcp/", "headers": { "Authorization": "Bearer ghp_xxx" } },
 *   "workspace": { "url": "https://my-worker.workers.dev/mcp" }
 * }
 */
export type McpServersStorage = Record<
  string,
  { url: string; headers?: Record<string, string>; useSse?: boolean; enabled?: boolean }
>;

export class UserSkillLoader {
  /**
   * Load all MCP skills from HTTP servers configured in chrome.storage.local.
   * Each server's tools are wrapped as CoTabor Skills and returned as a flat list.
   * Connection failures are logged and skipped — they do not abort the whole load.
   */
  static async loadSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    // 1. Load Built-in MCP skills first (Jina, Wikipedia)
    try {
      const builtinSkills = await loadBuiltInMcpSkills();
      console.log(`[UserSkillLoader] Loaded ${builtinSkills.length} built-in MCP skill(s)`);
      skills.push(...builtinSkills);
    } catch (e) {
      console.error("[UserSkillLoader] Failed to load built-in MCP skills:", e);
    }

    // 2. Load User-configured Remote MCP skills
    const configs = await UserSkillLoader.readMcpConfig();
    if (configs.length > 0) {
      console.log(`[UserSkillLoader] Loading skills from ${configs.length} Remote MCP server(s)...`);
      for (const config of configs) {
        const adapter = new McpSkillAdapter(config);
        try {
          await adapter.connect();
          const serverSkills = await adapter.listSkills();
          console.log(`[UserSkillLoader] Loaded ${serverSkills.length} skill(s) from "${config.name}"`);
          skills.push(...serverSkills);
        } catch (e: any) {
          console.error(`[UserSkillLoader] Failed to load from "${config.name}" (${config.url}):`, e.message);
          // Disconnect cleanly even on error
          await adapter.disconnect().catch(() => {});
        }
      }
    }

    return skills;
  }


  /**
   * Read MCP server configs from chrome.storage.local.
   * Returns an empty array if no config exists or chrome.storage is unavailable.
   */
  static async readMcpConfig(): Promise<McpServerConfig[]> {
    // Guard: chrome.storage is not available in Node.js / test environments
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return [];
    }

    try {
      const result = await chrome.storage.local.get("mcpServers");
      const stored: McpServersStorage = result.mcpServers || {};

      return Object.entries(stored)
        .filter(([, cfg]) => cfg.enabled !== false) // skip explicitly disabled servers
        .map(([name, cfg]) => ({
          name,
          url: cfg.url,
          headers: cfg.headers,
          useSse: cfg.useSse,
        }));
    } catch (e) {
      console.error("[UserSkillLoader] Failed to read MCP config from storage:", e);
      return [];
    }
  }

  /**
   * Save a full MCP servers config map to chrome.storage.local.
   */
  static async saveMcpConfig(servers: McpServersStorage): Promise<void> {
    await chrome.storage.local.set({ mcpServers: servers });
  }
}
