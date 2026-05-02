
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDagLaunchPayload,
  planDagLaunchFromGoal,
} from "../../../src/core/orchestrator/planning/DagLaunchPlanner.js";

describe("normalizeDagLaunchPayload", () => {
  it("keeps valid execution hints intact", () => {
    const payload = normalizeDagLaunchPayload(
      {
        goal: "整理页面并发布",
        executionMode: "shared_tab",
        maxParallelSubAgents: 2,
        subtasks: [
          { id: "draft", title: "提炼摘要", description: "阅读页面", resourceProfile: "page_read" },
          { id: "publish", title: "发布到 Notion", description: "汇总", dependsOn: ["draft"], resourceProfile: "external_io" },
        ],
      },
      "fallback",
    );
    assert.equal(payload.executionMode, "shared_tab");
    assert.equal(payload.subtasks?.[1].dependsOn?.[0], "draft");
  });

  it("rejects invalid resourceProfile value", () => {
    assert.throws(() => {
      normalizeDagLaunchPayload(
        {
          goal: "多页面采集",
          executionMode: "parallel_tabs",
          subtasks: [
            { id: "a", title: "采集 A", description: "读取", resourceProfile: "browser_read" },
          ],
        },
        "fallback",
      );
    });
  });
});

describe("planDagLaunchFromGoal", () => {
  it("accepts injected planner executor and returns dag mode result", async () => {
    const result = await planDagLaunchFromGoal("整理当前页面并发布到 Notion", {
      execute: async () => ({
        content: JSON.stringify({
          goal: "整理当前页面并发布到 Notion",
          executionMode: "shared_tab",
          maxParallelSubAgents: 2,
          subtasks: [
            { id: "draft_summary", title: "提炼摘要", description: "阅读", resourceProfile: "page_read" },
            { id: "publish", title: "发布", description: "汇总", dependsOn: ["draft_summary"], resourceProfile: "external_io" },
          ],
        }),
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
      }),
    });
    assert.equal(result.request.mode, "dag");
    assert.equal(result.request.source, "ai_plan");
    assert.equal(result.request.subtasks?.length, 2);
    assert.equal(result.request.subtasks?.[1].id, "publish");
  });

  it("retries once when planner output violates schema, accumulates token usage", async () => {
    let callCount = 0;
    const result = await planDagLaunchFromGoal("多页面采集", {
      execute: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            content: JSON.stringify({
              goal: "多页面采集",
              executionMode: "parallel_tabs", // invalid — triggers retry
              subtasks: [{ id: "a", title: "采集 A", description: "读取", resourceProfile: "browser_read" }],
            }),
            tokenUsage: { prompt: 5, completion: 8, total: 13 },
          };
        }
        return {
          content: JSON.stringify({
            goal: "多页面采集",
            executionMode: "isolated_tabs",
            subtasks: [{ id: "a", title: "采集 A", description: "读取", resourceProfile: "page_read" }],
          }),
          tokenUsage: { prompt: 7, completion: 9, total: 16 },
        };
      },
    });
    assert.equal(callCount, 2);
    assert.equal(result.payload.executionMode, "isolated_tabs");
    assert.equal(result.tokenUsage?.total, 29);
  });
});
