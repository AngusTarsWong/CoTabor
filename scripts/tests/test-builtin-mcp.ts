import { loadBuiltInMcpSkills } from "../../src/skills/bundled/mcp-builtin";

async function test() {
  console.log("Loading builtin MCP skills...");
  const skills = await loadBuiltInMcpSkills();
  console.log(`Loaded ${skills.length} skills.`);

  for (const skill of skills) {
    console.log(`- ${skill.name}`);
  }

  const wikiSearch = skills.find(s => s.name === "search_wikipedia");
  if (wikiSearch) {
    console.log("\nTesting search_wikipedia...");
    try {
      const res = await wikiSearch.execute({ query: "Artificial Intelligence" });
      console.log("Result:", res);
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  }

  const wikiHtml = skills.find(s => s.name === "get_wikipedia_page_html");
  if (wikiHtml) {
    console.log("\nTesting get_wikipedia_page_html...");
    try {
      const res = await wikiHtml.execute({ title: "Artificial intelligence" });
      console.log("Result:", res.substring(0, 200) + "...");
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  }

  const jinaSearch = skills.find(s => s.name === "jina_search_web");
  if (jinaSearch) {
    console.log("\nTesting jina_search_web...");
    try {
      const res = await jinaSearch.execute({ query: "What is MCP protocol?" });
      console.log("Result:", res.substring(0, 200) + "...");
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  }
}

test();
