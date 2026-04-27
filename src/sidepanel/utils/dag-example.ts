export function buildDagExamplePayload(): string {
  return JSON.stringify(
    {
      goal: "整理页面内容并发布到 Notion",
      executionMode: "shared_tab",
      maxParallelSubAgents: 2,
      subtasks: [
        {
          id: "draft_summary",
          title: "提炼摘要",
          description: "阅读当前页面，提炼 3 条核心结论。",
          resourceProfile: "page_read",
        },
        {
          id: "draft_highlights",
          title: "整理亮点",
          description: "基于当前页面内容，整理适合发布的亮点列表。",
          resourceProfile: "external_io",
        },
        {
          id: "publish",
          title: "发布到 Notion",
          dependsOn: ["draft_summary", "draft_highlights"],
          description: "汇总前置结果并调用 notion_operator 创建页面。",
          resourceProfile: "external_io",
        },
      ],
    },
    null,
    2,
  );
}

