export function buildDagExamplePayload(): string {
  return [
    "请把当前页面整理成一篇适合沉淀到 Notion 的短文。",
    "要求：",
    "1. 先阅读页面并提炼 3 条核心结论",
    "2. 再整理一组适合发布的亮点列表",
    "3. 最后汇总以上结果并发布到 Notion",
    "4. 如果适合并行，请自动拆成 DAG 子任务执行",
  ].join("\n");
}
