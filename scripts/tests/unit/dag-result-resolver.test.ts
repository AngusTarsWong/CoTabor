
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSubtaskDag } from "../../../src/core/orchestrator/planning/DependencyExtractor.js";
import { validateSubtaskDag } from "../../../src/core/orchestrator/planning/DagValidator.js";
import { resolveDagRunOutcome } from "../../../src/core/orchestrator/runtime/DagResultResolver.js";

function buildValidDag(tasks: Parameters<typeof buildSubtaskDag>[0]["tasks"]) {
  const dag = buildSubtaskDag({ tasks });
  const v = validateSubtaskDag(dag);
  dag.roots = v.roots;
  dag.topoOrder = v.topoOrder;
  return dag;
}

describe("resolveDagRunOutcome", () => {
  it("resolves to finish when majority of parallel tasks succeeded", async () => {
    const dag = buildValidDag([
      { id: "google", title: "Google News" },
      { id: "bing", title: "Bing News" },
      { id: "bbc", title: "BBC News" },
      { id: "baidu", title: "百度新闻" },
    ]);

    const resolution = await resolveDagRunOutcome(
      "汇总多新闻源人工智能新闻",
      {
        runId: "test_resolver",
        readyQueue: [],
        running: [],
        completed: ["google", "bbc", "baidu"],
        failed: ["bing"],
        blocked: [],
        attempts: { google: 1, bbc: 1, baidu: 1, bing: 1 },
        lastErrorByTask: {
          bing: { code: "sub_agent_failed", message: "Bing 页面不可达", retryable: true },
        },
      },
      dag,
      {
        google: { success: true, summary: "Google News 关注 AI 政策" },
        bbc: { success: true, summary: "BBC 关注 AI 监管" },
        baidu: { success: true, summary: "百度关注国内政策" },
        bing: { success: false, error: "Bing 页面不可达" },
      },
      {
        execute: async () => ({
          content: JSON.stringify({
            status: "finish",
            reason: "已有三个有效新闻源，足以完成综合总结。",
            finalSummary: "已基于 Google、BBC、百度完成总结，并注明 Bing 缺失。",
          }),
        }),
      },
    );

    assert.equal(resolution.status, "finish");
    assert.ok(resolution.finalSummary?.includes("Bing"));
  });
});
