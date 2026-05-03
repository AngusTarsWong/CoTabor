import "dotenv/config";
import { bootstrapNode } from "../../../src/runner/bootstrap-node";
import { loadBuiltInMcpSkills } from "../../../src/skills/bundled/mcp-builtin";
import { skillRegistry } from "../../../src/skills/registry";
import type { TaskDefinition } from "../../../src/tasks/types";

// In Node environment without automatic proxy support for fetch, we need to explicitly handle it if in China.
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  console.log(`[System] Injecting global ProxyAgent for fetch requests: ${proxy}`);
  const { setGlobalDispatcher, ProxyAgent } = require("undici");
  setGlobalDispatcher(new ProxyAgent(proxy));
}

export const wikipediaResearchTask: TaskDefinition = {
  id: "wikipedia-research",
  name: "使用 Wikipedia MCP 进行信息调研",
  requiredSkills: ["search_wikipedia", "get_wikipedia_summary"],
  defaultParams: {
    topic: "United States",
  },

  buildGoal(params = {}): string {
    const topic = params.topic ?? "United States";
    return [
      "请完成以下信息调研任务，全程无需使用浏览器访问网页，请直接调用你的 MCP 工具：",
      `1) 调用 \`search_wikipedia\` 工具，搜索关于 "${topic}" 的词条。`,
      "2) 从搜索结果中，找到最匹配的词条名称（请注意，必须是准确的英文标题，因为我们用的是英文维基百科）。",
      "3) 调用 \`get_wikipedia_summary\` 工具，传入你刚刚找到的确切词条标题，获取该词条的摘要内容。",
      "4) 根据你获取到的摘要内容，用中文为我总结一份关于该主题的详细介绍，字数不少于 200 字，重点包含它的历史、地理位置、或者重要特征。",
      "5) 任务完成后输出 finish，并在 description 中汇报你的中文总结。",
    ].join("\n");
  },
};

async function main() {
  const params = Object.fromEntries(
    process.argv.slice(2).map((arg) => arg.split("=") as [string, string])
  );

  const runtime = await bootstrapNode();
  
  // Register MCP skills to the agent's runtime environment manually for Node testing
  const mcpSkills = await loadBuiltInMcpSkills();
  for (const skill of mcpSkills) {
    skillRegistry.register(skill);
    console.log(`[mcp] Registered skill: ${skill.name}`);
  }

  const agent = runtime.createAgent({
    goal: wikipediaResearchTask.buildGoal(params),
    onLog: (msg) => console.log(`[log] ${msg}`),
    onStep: (step) => {
      const action = step.state?.planner_output?.action;
      if (step.node === "planner" && action) {
        console.log(`\n[step] ${action.type}${action.skill_name ? `(${action.skill_name})` : ""} — ${action.description ?? ""}`);
      }
    },
    onFinish: async (result) => {
      console.log("\n[done]", result?.output ?? JSON.stringify(result));
      await runtime.syncMemory(result?.finalState ?? result);
      await runtime.cleanup();
      process.exit(0);
    },
    onError: async (err) => {
      console.error("[error]", err);
      await runtime.cleanup();
      process.exit(1);
    },
  });

  await agent.start();
}

main();
