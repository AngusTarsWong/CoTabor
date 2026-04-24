import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const wikipediaServer = new McpServer({
  name: "Wikipedia API",
  version: "1.0.0",
});

wikipediaServer.tool(
  "search_wikipedia",
  "Search Wikipedia for a given query to find article titles and links. Use this before fetching a specific summary if you are unsure of the exact title.",
  { query: z.string().describe("Search term") },
  async ({ query }) => {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json`;
      const res = await fetch(url, {
        headers: { "Api-User-Agent": "CoTabor/1.0 (https://github.com/cotabor)" },
        // Use proxy from env if available for testing in restricted network environments
        // Fetch API in Node doesn't automatically use HTTP_PROXY environment variables
        // We handle this by adding dispatcher if proxy env var is set (simplified for this example)
      });
      const data = await res.json();
      const titles = data[1] as string[];
      const links = data[3] as string[];

      if (!titles || titles.length === 0) {
        return { content: [{ type: "text", text: "No Wikipedia articles found for this query." }] };
      }

      const results = titles.map((title, i) => `- ${title}: ${links[i]}`).join("\n");
      return { content: [{ type: "text", text: `Wikipedia Search Results:\n${results}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Wikipedia search failed: ${e.message}` }], isError: true };
    }
  }
);

wikipediaServer.tool(
  "get_wikipedia_summary",
  "Get the exact summary and extract of a specific Wikipedia article by title. Use the exact title from the search results.",
  { title: z.string().describe("The exact Wikipedia article title (e.g., 'Artificial intelligence')") },
  async ({ title }) => {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url, {
        headers: { "Api-User-Agent": "CoTabor/1.0 (https://github.com/cotabor)" }
      });
      if (!res.ok) {
        if (res.status === 404) {
          return { content: [{ type: "text", text: "Wikipedia page not found. Please try searching first to get the correct title." }], isError: true };
        }
        return { content: [{ type: "text", text: `Wikipedia API returned status ${res.status}` }], isError: true };
      }
      const data = await res.json();
      return { content: [{ type: "text", text: data.extract || "No summary available for this page." }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Failed to get Wikipedia summary: ${e.message}` }], isError: true };
    }
  }
);
