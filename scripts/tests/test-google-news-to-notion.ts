import { bootstrapNode } from "../../src/runner/bootstrap-node";
import type { TaskDefinition } from "../../src/tasks/types";

export const googleNewsToNotion: TaskDefinition = {
  id: "google-news-to-notion",
  name: "抓取 Google 新闻写入 Notion",
  requiredSkills: ["notion_operator"],
  defaultParams: {
    topic: "人工智能",
    language: "zh",
  },

  buildGoal(params = {}): string {
    const topic = params.topic ?? "人工智能";
    const today = new Date().toISOString().slice(0, 10);
    return [
      "请完成以下深度研究任务：",
      `1) 访问 Google 新闻：https://news.google.com/`,
      `2) 在搜索框中输入 '${topic}' 并搜索`,
      "3) 从页面或搜索结果中，直接访问第一篇文章",
      "4) 完整浏览该文章页面，提取核心观点并生成一份不少于 200 字的详细摘要",
      `5) 调用 notion_operator 技能，在 Notion 中创建一个名为『AI 深度研究：${topic}（${today}）』的新页面，将摘要内容保存进去`,
      "6) 任务完成后输出 finish，并在 description 中汇报 Notion 页面地址",
    ].join("\n");
  },
};

async function main() {
  const params = Object.fromEntries(
    process.argv.slice(2).map((arg) => arg.split("=") as [string, string])
  );

  const runtime = await bootstrapNode();

  const agent = runtime.createAgent({
    goal: googleNewsToNotion.buildGoal(params),
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
