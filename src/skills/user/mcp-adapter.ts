import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Skill, SkillRole } from "../types";

/**
 * MCP server configuration for browser extension (HTTP-only transports).
 * stdio transport is intentionally omitted — it requires Node.js child_process
 * and cannot run inside a Chrome extension.
 */
export interface McpServerConfig {
  /** Human-readable name shown in the UI (also used as the skill group label). */
  name: string;
  /** Full URL of the MCP server endpoint, e.g. https://my-worker.workers.dev/mcp */
  url: string;
  /** Optional HTTP headers forwarded with every request (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Whether to use legacy SSE transport instead of Streamable HTTP. Default: false. */
  useSse?: boolean;
}

export class McpSkillAdapter {
  private client: Client;
  private config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
    this.client = new Client(
      { name: "CoTabor-McpClient", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  /**
   * Connect to the remote MCP server.
   * Tries Streamable HTTP first; if that fails and useSse is not explicitly
   * set to false, retries with the legacy SSE transport.
   */
  async connect(): Promise<void> {
    const url = new URL(this.config.url);
    const reqInit: RequestInit = this.config.headers
      ? { headers: this.config.headers }
      : {};

    if (this.config.useSse) {
      // Legacy SSE-only servers (pre-2025-03 MCP spec)
      const transport = new SSEClientTransport(url);
      await this.client.connect(transport);
      console.log(`[McpSkillAdapter] Connected via SSE to: ${this.config.url}`);
      return;
    }

    try {
      // Modern Streamable HTTP (MCP spec 2025-03+)
      const transport = new StreamableHTTPClientTransport(url, { requestInit: reqInit });
      await this.client.connect(transport);
      console.log(`[McpSkillAdapter] Connected via Streamable HTTP to: ${this.config.url}`);
    } catch (streamErr) {
      // Fallback: server might only support legacy SSE
      console.warn(
        `[McpSkillAdapter] Streamable HTTP failed, retrying with SSE. Error: ${(streamErr as Error).message}`
      );
      const sseTransport = new SSEClientTransport(url);
      await this.client.connect(sseTransport);
      console.log(`[McpSkillAdapter] Connected via SSE (fallback) to: ${this.config.url}`);
    }
  }

  /** Disconnect cleanly. */
  async disconnect(): Promise<void> {
    try {
      await this.client.close();
    } catch (e) {
      // ignore
    }
  }

  /**
   * Fetch all tools from the connected MCP server and wrap them as CoTabor Skills.
   */
  async listSkills(): Promise<Skill[]> {
    const response = await this.client.listTools();
    const serverLabel = this.config.name;

    return response.tools.map((tool): Skill => {
      const role: SkillRole =
        /^(get|read|search|list|fetch|query)/i.test(tool.name) ? "query" : "action";

      return {
        name: tool.name,
        description: `[${serverLabel}] ${tool.description || "No description."}`,
        role,
        type: "mcp",
        params: tool.inputSchema as any,

        execute: async (params: any) => {
          console.log(`[McpSkill:${serverLabel}] Executing ${tool.name}`, params);
          const result = await this.client.callTool({ name: tool.name, arguments: params });
          const contentArray = Array.isArray(result.content) ? result.content : [];
          // MCP returns { content: [...], isError? }
          if (result.isError) {
            const errText = contentArray
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("\n");
            throw new Error(`MCP tool error: ${errText}`);
          }
          // Unwrap text content for convenience
          const textParts = contentArray
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text);
          return textParts.length === 1 ? textParts[0] : contentArray;
        },

        getManual: async () => `
# Skill: ${tool.name}
**Source**: MCP Server — ${serverLabel} (${this.config.url})

${tool.description || "No description provided."}

## Parameters
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`
`.trim(),
      };
    });
  }
}
