import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "./in-memory-transport";
import { jinaServer } from "./jina/server";
import { wikipediaServer } from "./wikipedia/server";
import { Skill, SkillRole } from "../../types";

export const BUILT_IN_SERVERS = [
  { id: "jina", name: "Jina Search & Reader", server: jinaServer },
  { id: "wikipedia", name: "Wikipedia API", server: wikipediaServer }
];

export async function loadBuiltInMcpSkills(): Promise<Skill[]> {
  const skills: Skill[] = [];
  let states: Record<string, boolean> = { jina: true, wikipedia: true }; // default enabled

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const res = await chrome.storage.local.get("builtinMcpServers");
      if (res.builtinMcpServers) {
        states = res.builtinMcpServers;
      }
    } catch (e) {
      console.warn("Failed to read builtin MCP states from storage", e);
    }
  }

  for (const { id, name, server } of BUILT_IN_SERVERS) {
    // If explicitly disabled by user, skip loading
    if (states[id] === false) continue;

    try {
      const [clientTransport, serverTransport] = InMemoryTransport.createPair();
      
      // The server listens on the server side of the pair
      await server.connect(serverTransport);
      
      // The client connects via the client side
      const client = new Client({ name: "CoTabor-BuiltInMcpClient", version: "1.0.0" }, { capabilities: {} });
      await client.connect(clientTransport);
      
      const response = await client.listTools();
      
      for (const tool of response.tools) {
        const role: SkillRole = /^(get|read|search|list|fetch|query)/i.test(tool.name) ? "query" : "action";
        skills.push({
          name: tool.name,
          description: `[Built-in MCP: ${name}] ${tool.description || ""}`,
          role,
          type: "mcp",
          params: tool.inputSchema as any,
          execute: async (params: any) => {
            const result = await client.callTool({ name: tool.name, arguments: params });
            const content = result.content as any[];
            if (result.isError) {
              const errParts = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
              throw new Error(`MCP tool error: ${errParts}`);
            }
            const textParts = content.filter((c: any) => c.type === "text").map((c: any) => c.text);
            return textParts.length === 1 ? textParts[0] : content;
          },
          getManual: async () => `# Skill: ${tool.name}\n**Source**: Built-in MCP (${name})\n\n${tool.description}`
        });
      }
      console.log(`[BuiltinMcp] Loaded server: ${name}`);
    } catch (e: any) {
      console.error(`[BuiltinMcp] Failed to load server ${name}:`, e.message);
    }
  }

  return skills;
}
