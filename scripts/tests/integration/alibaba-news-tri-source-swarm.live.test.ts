import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTestRunner } from "../runners/base-runner";
import { ALIBABA_TRI_NEWS_SITES } from "../fixtures/news-sites";

const LIVE_TIMEOUT_MS = 900_000;
const AUTO_STOP_MS = 840_000;

type ObservedAgent = {
  nodeId?: string;
  taskRunId?: string;
  tabId?: number;
  status?: string;
  currentUrl?: string;
  currentStep?: string;
  summarySoFar?: string;
  error?: string;
};

type ObservedStep = {
  node?: string;
  taskRunId?: string;
  actionType?: string;
  skillName?: string;
  description?: string;
  result?: string;
  status?: string;
  durationMs?: number;
};

function buildTriSourceAlibabaGoal(): string {
  const sourceLines = ALIBABA_TRI_NEWS_SITES.map((site, index) => (
    `${index + 1}. task id 必须使用 ${site.key}；来源 ${site.label}: ${site.directUrl}\n` +
    `   子任务要求：打开该 URL，采集 2 到 3 条与 ${site.query} 相关的新闻，` +
    `记录标题、媒体来源、发布时间、链接和简短摘要，并用 memorize 写入 ${site.key}_result。`
  ));

  return [
    "请使用 spawn_subagent 并行启动 3 个子 Agent，分别从 Google News、百度新闻、Yahoo News 采集关于“阿里巴巴 / Alibaba / BABA”的最新新闻。",
    "每个来源必须独立分配给一个子 Agent，不要添加汇总子任务；所有子 Agent 完成后，由主 Agent 基于 Sub-Agent Results 自己输出最终 finish。",
    "来源清单：",
    ...sourceLines,
    "最终中文综合分析必须包含：共同关注主题、三平台报道重点差异、对阿里巴巴近期动态的综合判断、来源清单。",
    "如果某些来源无法访问，请明确说明失败来源和原因；只要至少两个来源有有效证据，请基于已成功来源继续汇总。",
  ].join("\n");
}

function extractFinalSummary(result: any): string {
  const candidates = [
    result?.planner_output?.action?.result,
    result?.planner_output?.action?.summary,
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
  return ALIBABA_TRI_NEWS_SITES.filter((site) =>
    site.patterns.some((pattern) => pattern.test(text)),
  ).length;
}

function summarizeStep(step: any): ObservedStep {
  const action = step?.update?.planner_output?.action;
  const watchdog = step?.update?.watchdog;

  return {
    node: step?.node,
    taskRunId: step?.taskRunId,
    actionType: action?.type,
    skillName: action?.skill_name,
    description: action?.description,
    result: action?.result ?? action?.summary,
    status: watchdog?.status,
    durationMs: step?.durationMs,
  };
}

function summarizeAgent(agent: any): ObservedAgent {
  return {
    nodeId: agent?.nodeId,
    taskRunId: agent?.taskRunId,
    tabId: agent?.tabId,
    status: agent?.status,
    currentUrl: agent?.currentUrl,
    currentStep: agent?.currentStep,
    summarySoFar: agent?.summarySoFar,
    error: agent?.error,
  };
}

function getResultKeys(result: any): string[] {
  return Object.keys(result?.subagent_results ?? {});
}

describe("Live E2E: Alibaba tri-source news spawn_subagent swarm", { timeout: LIVE_TIMEOUT_MS }, () => {
  it("collects Alibaba news from Google, Baidu, and Yahoo with isolated sub-agents", async () => {
    await withTestRunner("alibaba-news-tri-source-swarm", async (runner, runtime) => {
      const goal = buildTriSourceAlibabaGoal();
      const resourceSnapshots: any[] = [];
      const observedSteps: ObservedStep[] = [];
      const plannerActions: string[] = [];
      let sawSpawnSubagent = false;

      runner.logEvent("phase", "Starting Alibaba tri-source news spawn_subagent live task");
      runner.logEvent("goal", goal);

      const agent = runtime.createAgent({
        goal,
        onLog: (msg) => runner.logEvent("agent_log", msg),
        onResourceRuntimeUpdate: (snapshot) => {
          if (!snapshot?.agents?.length) return;

          resourceSnapshots.push(snapshot);
          const agents = snapshot.agents.map(summarizeAgent);

          runner.logEvent(
            "swarm_runtime",
            `agents=${agents.length}; tabs=${agents.map((agent) => `${agent.nodeId}:${agent.tabId ?? "none"}`).join(", ")}; statuses=${agents.map((agent) => `${agent.nodeId}:${agent.status}`).join(", ")}`,
            { agents, assignments: snapshot.assignments, groupId: snapshot.groupId },
          );
        },
        onStep: (step) => {
          const summary = summarizeStep(step);
          observedSteps.push(summary);

          if (summary.node === "planner" && summary.actionType) {
            plannerActions.push(summary.actionType);
            if (summary.actionType === "spawn_subagent") {
              sawSpawnSubagent = true;
            }
          }

          runner.logEvent(
            "step",
            `taskRunId=${summary.taskRunId ?? "root"}; node=${summary.node ?? "unknown"}; action=${summary.actionType ?? "none"}${summary.skillName ? `(${summary.skillName})` : ""}; status=${summary.status ?? "none"}`,
            summary,
          );
        },
      });

      const autoStopTimer = setTimeout(() => {
        runner.logEvent("cleanup", `Auto-stopping Alibaba tri-source news swarm after ${Math.round(AUTO_STOP_MS / 1000)}s`);
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
      const childTaskRunIds = new Set(
        Object.values(result?.subagent_results ?? {})
          .map((subResult: any) => subResult?.taskRunId)
          .filter((taskRunId: any): taskRunId is string => typeof taskRunId === "string" && taskRunId.length > 0),
      );
      const childSteps = observedSteps.filter((step) => step.taskRunId && childTaskRunIds.has(step.taskRunId));
      const failedAgents = (lastSnapshot?.agents ?? []).filter((agent: any) => agent.status === "failed");

      runner.logEvent("result_status", String(result?.status ?? "UNKNOWN"));
      runner.logEvent("planner_actions", plannerActions.join(" -> "));
      runner.logEvent("subagent_results", JSON.stringify(resultKeys));
      runner.logEvent("child_task_run_ids", JSON.stringify([...childTaskRunIds]));
      runner.logEvent("subagent_tab_ids", JSON.stringify([...observedSubAgentTabIds]));
      runner.logEvent("failed_agents", JSON.stringify(failedAgents.map(summarizeAgent)));
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
      assert.ok(resultKeys.length >= 2, `Should collect at least 2 sub-agent results, got ${resultKeys.length}`);
      assert.ok(childSteps.length > 0, "Should forward child sub-agent steps for process observation");
      assert.match(finalSummary, /阿里巴巴|Alibaba|BABA/i, "Final summary should mention Alibaba");
      assert.ok(finalSummary.length >= 120, "Final summary should be substantial");
      assert.ok(
        sourceTypeCount >= 2,
        `Final summary should mention at least 2 source types, found ${sourceTypeCount}`,
      );

      for (const site of ALIBABA_TRI_NEWS_SITES) {
        const mentioned = site.patterns.some((pattern) => pattern.test(finalSummary));
        const hasMatchingResult = resultKeys.some((key) => key.includes(site.key) || key.includes(site.key.replace("_news", "")));
        if (!mentioned && !hasMatchingResult) {
          runner.logEvent(
            "source_gap",
            `${site.label} did not appear in final summary or subagent result keys; check trace for access failure or model omission`,
          );
        }
      }
    }, { headless: false });
  });
});
