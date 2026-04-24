import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JSDOM } from "jsdom";
import { z } from "zod";

export const wikipediaServer = new McpServer({
  name: "Wikipedia API",
  version: "1.0.0",
});

const WIKIPEDIA_REST_BASE = "https://en.wikipedia.org/w/rest.php/v1";
const WIKIPEDIA_ACTION_API = "https://en.wikipedia.org/w/api.php";
const WIKIPEDIA_WEB_BASE = "https://en.wikipedia.org/wiki";
const USER_AGENT = "CoTabor/1.0 (https://github.com/cotabor)";

const buildPageUrl = (keyOrTitle: string) => `${WIKIPEDIA_WEB_BASE}/${encodeURIComponent(keyOrTitle.replace(/ /g, "_"))}`;

const createHeaders = (accept?: string) => {
  const headers: Record<string, string> = {
    "Api-User-Agent": USER_AGENT,
  };
  if (accept) {
    headers.Accept = accept;
  }
  return headers;
};

const createErrorResult = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

const createTextResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  maxAttempts = 3
): Promise<Response> => {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, init);
    if (response.status !== 429) {
      return response;
    }

    lastResponse = response;
    if (attempt === maxAttempts) {
      break;
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1000
      : attempt * 1200;
    await sleep(waitMs);
  }

  return lastResponse!;
};

const extractSummaryFromHtml = (html: string): string => {
  const dom = new JSDOM(html);
  const paragraphs = Array.from(dom.window.document.querySelectorAll("p"))
    .map((p) => p.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean);

  if (paragraphs.length === 0) {
    const fallbackText = dom.window.document.body?.textContent?.replace(/\s+/g, " ").trim() || "";
    return fallbackText || "No summary available for this page.";
  }

  const summaryParts: string[] = [];
  let totalLength = 0;
  for (const paragraph of paragraphs) {
    summaryParts.push(paragraph);
    totalLength += paragraph.length;
    if (summaryParts.length >= 3 || totalLength >= 1200) {
      break;
    }
  }
  return summaryParts.join("\n\n");
};

const formatSearchResults = (pages: Array<{ title: string; key?: string; description?: string; excerpt?: string }>) => {
  if (pages.length === 0) {
    return "No Wikipedia articles found for this query.";
  }

  const results = pages.map((page) => {
    const title = page.title || page.key || "Untitled";
    const key = page.key || title;
    const description = page.description ? ` | ${page.description}` : "";
    const excerpt = page.excerpt
      ? ` | excerpt: ${String(page.excerpt).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()}`
      : "";
    return `- ${title}: ${buildPageUrl(key)}${description}${excerpt}`;
  }).join("\n");

  return `Wikipedia Search Results:\n${results}`;
};

wikipediaServer.tool(
  "search_wikipedia",
  "Search Wikipedia for a given query to find article titles and links. Use this before fetching a specific summary if you are unsure of the exact title.",
  { query: z.string().describe("Search term") },
  async ({ query }) => {
    try {
      const url = `${WIKIPEDIA_ACTION_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=10&format=json&origin=*`;
      const res = await fetchWithRetry(url, {
        headers: createHeaders("application/json"),
      });
      if (!res.ok) {
        return createErrorResult(`Wikipedia search failed with status ${res.status}.`);
      }
      const data = await res.json();
      const pages = Array.isArray(data?.query?.search)
        ? data.query.search.map((item: any) => ({
            title: item.title,
            key: item.title,
            excerpt: item.snippet,
          }))
        : [];
      return createTextResult(formatSearchResults(pages));
    } catch (e: any) {
      return createErrorResult(`Wikipedia search failed: ${e.message}`);
    }
  }
);

wikipediaServer.tool(
  "get_wikipedia_summary",
  "Get a readable summary of a specific Wikipedia article by title, extracted from the official MediaWiki REST API HTML content. Use the exact title from the search results.",
  { title: z.string().describe("The exact Wikipedia article title (e.g., 'Artificial intelligence')") },
  async ({ title }) => {
    try {
      const metadataUrl = `${WIKIPEDIA_REST_BASE}/page/${encodeURIComponent(title)}`;
      const metadataRes = await fetchWithRetry(metadataUrl, {
        headers: createHeaders("application/json"),
      });
      if (!metadataRes.ok) {
        if (metadataRes.status === 404) {
          return createErrorResult("Wikipedia page not found. Please try searching first to get the correct title.");
        }
        return createErrorResult(`Wikipedia metadata request returned status ${metadataRes.status}.`);
      }
      const metadata = await metadataRes.json();

      const htmlUrl = `${WIKIPEDIA_REST_BASE}/page/${encodeURIComponent(title)}/html`;
      const htmlRes = await fetchWithRetry(htmlUrl, {
        headers: createHeaders("text/html"),
      });
      if (!htmlRes.ok) {
        if (htmlRes.status === 404) {
          return createErrorResult("Wikipedia page HTML not found. Please verify the title.");
        }
        return createErrorResult(`Wikipedia HTML request returned status ${htmlRes.status}.`);
      }
      const html = await htmlRes.text();
      const summary = extractSummaryFromHtml(html);
      const resolvedTitle = metadata?.title || title;
      const key = metadata?.key || resolvedTitle;
      const resultText = [
        `Title: ${resolvedTitle}`,
        `URL: ${buildPageUrl(key)}`,
        "",
        summary,
      ].join("\n");
      return createTextResult(resultText);
    } catch (e: any) {
      return createErrorResult(`Failed to get Wikipedia summary: ${e.message}`);
    }
  }
);

wikipediaServer.tool(
  "get_wikipedia_page_html",
  "Get the complete HTML body of a specific Wikipedia article from the official MediaWiki REST API. Use this when you need the full page content for deeper analysis or summarization.",
  { title: z.string().describe("The exact Wikipedia article title (e.g., 'Artificial intelligence')") },
  async ({ title }) => {
    try {
      const metadataUrl = `${WIKIPEDIA_REST_BASE}/page/${encodeURIComponent(title)}`;
      const metadataRes = await fetchWithRetry(metadataUrl, {
        headers: createHeaders("application/json"),
      });
      if (!metadataRes.ok) {
        if (metadataRes.status === 404) {
          return createErrorResult("Wikipedia page not found. Please try searching first to get the correct title.");
        }
        return createErrorResult(`Wikipedia page metadata request returned status ${metadataRes.status}.`);
      }
      const metadata = await metadataRes.json();

      const htmlUrl = `${WIKIPEDIA_REST_BASE}/page/${encodeURIComponent(title)}/html`;
      const htmlRes = await fetchWithRetry(htmlUrl, {
        headers: createHeaders("text/html"),
      });
      if (!htmlRes.ok) {
        if (htmlRes.status === 404) {
          return createErrorResult("Wikipedia page HTML not found. Please verify the title.");
        }
        return createErrorResult(`Wikipedia page HTML request returned status ${htmlRes.status}.`);
      }

      const html = await htmlRes.text();
      const resolvedTitle = metadata?.title || title;
      const key = metadata?.key || resolvedTitle;
      const htmlOutput = [
        `Title: ${resolvedTitle}`,
        `URL: ${buildPageUrl(key)}`,
        `Content-Type: text/html`,
        "",
        html,
      ].join("\n");

      return createTextResult(htmlOutput);
    } catch (e: any) {
      return createErrorResult(`Failed to get Wikipedia page HTML: ${e.message}`);
    }
  }
);
