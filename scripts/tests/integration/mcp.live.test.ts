import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadBuiltInMcpSkills } from "../../../src/skills/bundled/mcp-builtin";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const { setGlobalDispatcher, ProxyAgent } = require("undici");
  setGlobalDispatcher(new ProxyAgent(proxy));
}

describe("Integration: MCP Services", { timeout: 60000 }, () => {
  it("should load built-in MCP skills successfully", async () => {
    const skills = await loadBuiltInMcpSkills();
    assert.ok(skills.length > 0, "Should load at least one MCP skill");
    
    const skillNames = skills.map(s => s.name);
    assert.ok(skillNames.includes("search_wikipedia"), "search_wikipedia should be available");
    assert.ok(skillNames.includes("get_wikipedia_summary"), "get_wikipedia_summary should be available");
    assert.ok(skillNames.includes("jina_search_web"), "jina_search_web should be available");
  });

  it("should execute search_wikipedia skill", async () => {
    const skills = await loadBuiltInMcpSkills();
    const wikiSearch = skills.find(s => s.name === "search_wikipedia");
    assert.ok(wikiSearch, "search_wikipedia skill not found");
    
    const res = await wikiSearch.execute({ query: "Artificial Intelligence" });
    assert.ok(typeof res === "string" && res.length > 0, "Result should be a non-empty string");
    assert.ok(res.toLowerCase().includes("artificial intelligence"), "Result should mention the query");
  });

  it("should execute get_wikipedia_summary skill", async () => {
    const skills = await loadBuiltInMcpSkills();
    const wikiSummary = skills.find(s => s.name === "get_wikipedia_summary");
    assert.ok(wikiSummary, "get_wikipedia_summary skill not found");
    
    const res = await wikiSummary.execute({ title: "Artificial intelligence" });
    assert.ok(typeof res === "string" && res.length > 0, "Result should be a non-empty string");
  });
});
