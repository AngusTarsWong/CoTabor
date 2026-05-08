import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTestRunner } from "../runners/base-runner";
import { ALIBABA_NEWS_SITES } from "../fixtures/news-sites";

const LIVE_TIMEOUT_MS = 900_000;
const AUTO_STOP_MS = 840_000;

function buildAlibabaSpawnSubagentGoal(): string {
  const sourceLines = ALIBABA_NEWS_SITES.map((site, index) => (
    `${index + 1}. ${site.label}: ${site.directUrl}\n` +
    `   子任务要求：打开该 URL，采集 2 到 3 条与 ${site.query} 相关的新闻，` +
    `尽量记录标题、媒体来源、发布时间、链接和简短摘要，并用 memorize 写入 ${site.key}_result。`
  ));

  return [
    "请使用 spawn_subagent 并行启动多个子 Agent，采集关于“阿里巴巴 / Alibaba / BABA”的最新新闻。",
    "每个来源独立分配给一个子 Agent，不要添加汇总子任务；所有子 Agent 完成后，由主 Agent 基于 Sub-Agent Results 自己输出最终 finish。",
    "来源清单：",
    ...sourceLines,
    "最终中文综合分析必须包含：共同关注主题、中文/英文来源视角差异、对阿里巴巴近期动态的综合判断、来源清单。",
    "如果某些来源无法访问，请明确说明失败来源和原因；只要证据足够，请基于已成功来源继续汇总。",
  ].join("\n");
}

function extractFinalSummary(result: any): string {
  const candidates = [
    result?.planner_output?.action?.result,
    result?.planner_output?.action?.description,
    result?.last_observation?.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function countMentionedSourceTypes(text: string): number {
  const patterns = [
    /google\s*news|谷歌新闻|news\.google/i,
    /bing\s*news|必应新闻|bing\.com/i,
    /百度新闻|百度搜索|baidu/i,
    /reuters|cnbc|bloomberg|financial\s*times|英文财经/i,
    /新浪财经|财新|36氪|证券时报|中文财经/i,
  ];

  return patterns.filter((pattern) => pattern.test(text)).length;
}

function getResultKeys(result: any): string[] {
  return Object.keys(result?.subagent_results ?? {});
}

describe("Live E2E: Alibaba News spawn_subagent swarm", { timeout: LIVE_TIMEOUT_MS }, () => {
  it("collects Alibaba news with spawn_subagent and synthesizes a final summary", async () => {
    await withTestRunner("alibaba-news-swarm", async (runner, runtime) => {
      const goal = buildAlibabaSpawnSubagentGoal();
      const resourceSnapshots: any[] = [];
      const plannerActions: string[] = [];
      let sawSpawnSubagent = false;

      runner.logEvent("phase", "Starting Alibaba news spawn_subagent live task");

      const agent = runtime.createAgent({
        goal,
        onLog: (msg) => runner.logEvent("agent_log", msg),
        onResourceRuntimeUpdate: (snapshot) => {
          if (snapshot?.agents?.length) {
            resourceSnapshots.push(snapshot);
            runner.logEvent(
              "swarm_runtime",
              `agents=${snapshot.agents.length}; tabs=${snapshot.agents.map((agent: any) => `${agent.nodeId}:${agent.tabId ?? "none"}`).join(", ")}; statuses=${snapshot.agents.map((agent: any) => `${agent.nodeId}:${agent.status}`).join(", ")}`,
            );
          }
        },
        onStep: (step) => {
          const action = step?.update?.planner_output?.action;
          if (step?.node === "planner" && action) {
            plannerActions.push(action.type);
            if (action.type === "spawn_subagent") {
              sawSpawnSubagent = true;
            }
            runner.logEvent(
              "step",
              `${action.type}${action.skill_name ? `(${action.skill_name})` : ""} - ${action.description || ""}`,
            );
          }
        },
      });

      const autoStopTimer = setTimeout(() => {
        runner.logEvent("cleanup", `Auto-stopping Alibaba news swarm after ${Math.round(AUTO_STOP_MS / 1000)}s`);
        agent.stop().catch((error) => runner.logEvent("cleanup_error", String(error)));
      }, AUTO_STOP_MS);
      autoStopTimer.unref?.();

      let result: any;
      try {
        result = await agent.start();
      } finally {
        clearTimeout(autoStopTimer);
      }

      const resultKeys = getResultKeys(result);
      const finalSummary = extractFinalSummary(result);
      const sourceTypeCount = countMentionedSourceTypes(finalSummary);
      const lastSnapshot = resourceSnapshots[resourceSnapshots.length - 1];
      const maxObservedAgents = Math.max(
        0,
        ...resourceSnapshots.map((snapshot) => Array.isArray(snapshot.agents) ? snapshot.agents.length : 0),
      );
      const observedSubAgentTabIds = new Set(
        resourceSnapshots
          .flatMap((snapshot) => Array.isArray(snapshot.agents) ? snapshot.agents : [])
          .map((agent: any) => agent.tabId)
          .filter((tabId: any): tabId is number => typeof tabId === "number"),
      );

      runner.logEvent("result_status", String(result?.status ?? "UNKNOWN"));
      runner.logEvent("planner_actions", plannerActions.join(" -> "));
      runner.logEvent("subagent_results", JSON.stringify(resultKeys));
      runner.logEvent("subagent_tab_ids", JSON.stringify([...observedSubAgentTabIds]));
      runner.logEvent("final_summary", finalSummary);

      assert.equal(result?.status, "FINISHED", `Agent should finish successfully, got ${result?.status}`);
      assert.equal(sawSpawnSubagent, true, "Root planner should emit spawn_subagent");
      assert.ok(maxObservedAgents >= 3, `Should observe at least 3 sub-agents, got ${maxObservedAgents}`);
      assert.ok(
        observedSubAgentTabIds.size >= 3,
        `Should observe at least 3 unique sub-agent tabIds, got ${JSON.stringify([...observedSubAgentTabIds])}`,
      );
      assert.equal(
        observedSubAgentTabIds.size === 1 && observedSubAgentTabIds.has(runtime.tabId),
        false,
        `Sub-agents should not all share the runtime virtual tabId ${runtime.tabId}`,
      );
      assert.ok(resultKeys.length >= 3, `Should collect at least 3 sub-agent results, got ${resultKeys.length}`);
      assert.match(finalSummary, /阿里巴巴|Alibaba|BABA/i, "Final summary should mention Alibaba");
      assert.ok(finalSummary.length >= 100, "Final summary should be substantial");
      assert.ok(
        sourceTypeCount >= 2,
        `Final summary should mention at least 2 source types, found ${sourceTypeCount}`,
      );

      if (lastSnapshot?.agents) {
        const failedAgents = lastSnapshot.agents.filter((agent: any) => agent.status === "failed");
        if (failedAgents.length > 0) {
          runner.logEvent(
            "degraded_success",
            `Completed with failed sources: ${failedAgents.map((agent: any) => `${agent.nodeId}:${agent.error || "unknown"}`).join("; ")}`,
          );
        }
      }
    }, { headless: false });
  });
});
