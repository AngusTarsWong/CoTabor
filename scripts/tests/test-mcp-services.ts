import "dotenv/config";
import { loadBuiltInMcpSkills } from "../../src/skills/bundled/mcp-builtin";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  console.log(`[System] Injecting global ProxyAgent for fetch requests: ${proxy}`);
  const { setGlobalDispatcher, ProxyAgent } = require("undici");
  setGlobalDispatcher(new ProxyAgent(proxy));
}

async function testMcpServices() {
  console.log("========================================");
  console.log("🚀 Starting MCP Services Test Suite");
  console.log("========================================\n");

  let skills;
  try {
    console.log("[System] Loading built-in MCP skills...");
    skills = await loadBuiltInMcpSkills();
    console.log(`[System] Successfully loaded ${skills.length} skills.\n`);
  } catch (error: any) {
    console.error("[System] Failed to load MCP skills:", error.message);
    process.exit(1);
  }

  // --- Test Wikipedia Search ---
  const wikiSearch = skills.find(s => s.name === "search_wikipedia");
  if (wikiSearch) {
    console.log("----------------------------------------");
    console.log("🧪 Testing: search_wikipedia");
    console.log("----------------------------------------");
    try {
      // In MCP execute takes an object where 'arguments' is the parameters
      const res = await wikiSearch.execute({ query: "Artificial Intelligence" });
      console.log("✅ Success! Result snippet:");
      console.log(res.substring(0, 300) + "...\n");
    } catch (e: any) {
      console.error("❌ Failed:", e.message, "\n");
    }
  }

  // --- Test Wikipedia Summary ---
  const wikiSummary = skills.find(s => s.name === "get_wikipedia_summary");
  if (wikiSummary) {
    console.log("----------------------------------------");
    console.log("🧪 Testing: get_wikipedia_summary");
    console.log("----------------------------------------");
    try {
      const res = await wikiSummary.execute({ title: "Artificial intelligence" });
      console.log("✅ Success! Result snippet:");
      console.log(res.substring(0, 300) + "...\n");
    } catch (e: any) {
      console.error("❌ Failed:", e.message, "\n");
    }
  }

  // --- Test Jina Reader ---
  const jinaReader = skills.find(s => s.name === "jina_read_url");
  if (jinaReader) {
    console.log("----------------------------------------");
    console.log("🧪 Testing: jina_read_url");
    console.log("----------------------------------------");
    try {
      const res = await jinaReader.execute({ url: "https://example.com" });
      console.log("✅ Success! Result snippet:");
      console.log(res.substring(0, 300) + "...\n");
    } catch (e: any) {
      console.error("❌ Failed:", e.message, "\n");
    }
  }

  console.log("========================================");
  console.log("🏁 Test Suite Completed");
  console.log("========================================");
  process.exit(0);
}

testMcpServices();