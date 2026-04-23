import type { TaskDefinition } from "./types";

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
      `1) 访问百度新闻：https://news.baidu.com/`,
      `2) 在搜索框中输入 '${topic}' 并搜索`,
      "3) 从页面或搜索结果中，直接访问第一篇文章",
      "4) 完整浏览该文章页面，提取核心观点并生成一份不少于 200 字的详细摘要",
      `5) 调用 notion_operator 技能，在 Notion 中创建一个名为『AI 深度研究：${topic}（${today}）』的新页面，将摘要内容保存进去`,
      "6) 任务完成后输出 finish，并在 description 中汇报 Notion 页面地址",
    ].join("\n");
  },
};
