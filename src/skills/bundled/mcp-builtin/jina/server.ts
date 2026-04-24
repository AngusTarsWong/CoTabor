import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const jinaServer = new McpServer({
  name: "Jina Reader",
  version: "1.0.0",
});

jinaServer.tool(
  "jina_read_url",
  "Read and extract clean markdown content from a specific URL using Jina AI. (No API key required)",
  { url: z.string().url().describe("The full URL to read") },
  async ({ url }) => {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          "Accept": "application/json",
          "X-Retain-Images": "none"
        }
      });
      if (!res.ok) {
        return { content: [{ type: "text", text: `Read URL failed: ${res.status} ${res.statusText}` }], isError: true };
      }
      const data = await res.json();
      return { content: [{ type: "text", text: data.data?.content || data.data?.text || JSON.stringify(data) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Read URL failed: ${e.message}` }], isError: true };
    }
  }
);
