import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTestRunner } from "../runners/base-runner";
import type { TaskDefinition } from "../../../src/tasks/types";

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

describe("Live Single Agent: Google News to Notion", { timeout: 180000 }, () => {
  it("should successfully navigate Google News, summarize, and publish to Notion", async () => {
    await withTestRunner("google-news-to-notion", async (runner, runtime) => {
      
      const goal = googleNewsToNotion.buildGoal({ topic: "Test Integration Automation" });
      runner.logEvent("info", "Starting Google News to Notion task");

      const agent = runtime.createAgent({
        goal,
        onLog: (msg) => runner.logEvent("agent_log", msg),
        onStep: (step) => {
          const action = step.state?.planner_output?.action;
          if (step.node === "planner" && action) {
            runner.logEvent("step", `${action.type}(${action.skill_name || ''}) — ${action.description || ''}`);
          }
        },
      });

      const result = await agent.start();
      runner.logEvent("result", JSON.stringify(result));
      
      assert.equal(agent.status, "FINISHED", "Agent should finish successfully");
      
      await runtime.syncMemory(result?.finalState ?? result);
    }, { headless: false });
  });
});
