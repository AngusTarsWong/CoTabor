import { agentGraph } from "../src/core/graph/graph";
import { memoryNode } from "../src/core/graph/nodes/memory";

async function test() {
  const { skillRegistry } = await import("../src/skills/registry");
  await skillRegistry.loadAll();
  console.log("All skills count:", skillRegistry.getAllSkills().length);
  
  const state: any = { meta_data: { url: "https://www.google.com" }, total_history: [] };
  const res = await memoryNode(state);
  console.log("Memory node returned skills count:", res.available_skills?.length);
}
test();
