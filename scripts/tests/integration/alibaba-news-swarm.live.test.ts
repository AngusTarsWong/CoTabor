import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

if (!process.env.VITE_MULTI_AGENT_SCHEDULER) {
  process.env.VITE_MULTI_AGENT_SCHEDULER = "true";
}

import { withTestRunner } from "../runners/base-runner";
import { orchestrator } from "../../../src/core/orchestrator/AgentOrchestrator";
import { planDagLaunchFromGoal } from "../../../src/core/orchestrator/planning/DagLaunchPlanner";
import { ALIBABA_NEWS_GOAL, ALIBABA_NEWS_SITES } from "../fixtures/news-sites";
import type { TaskGraphTaskInput } from "../../../src/core/orchestrator/types/TaskGraph";

const SWARM_AUTO_CANCEL_MS = 840000;

function getTaskText(task: TaskGraphTaskInput): string {
  return [task.id, task.title, task.goal, task.description].filter(Boolean).join(" ");
}

function detectSiteKey(task: TaskGraphTaskInput): string | undefined {
  const text = getTaskText(task);
  return ALIBABA_NEWS_SITES.find((site) => site.patterns.some((pattern) => pattern.test(text)))?.key;
}

function extractSummary(result: any): string {
  const candidates = [
    result?.final_summary,
    result?.dag_resolution?.finalSummary,
    result?.planner_output?.action?.result,
    result?.planner_output?.action?.description,
    result?.output,
    result?.summary,
    result?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function countMentionedSources(summary: string): number {
  const sourcePatterns = [
    /google/i,
    /bing/i,
    /百度/,
    /reuters|cnbc|bloomberg|financial\s*times/i,
    /新浪|财新|36氪|证券时报/,
  ];
  return sourcePatterns.filter((pattern) => pattern.test(summary)).length;
}

describe("Live E2E: Alibaba News Swarm DAG", { timeout: 900000 }, () => {
  it("plans and executes a multi-agent Alibaba news collection task in isolated tabs", async () => {
    await withTestRunner(
      "alibaba-news-swarm",
      async (runner, runtime) => {
        runner.logEvent("phase", "Phase 1: Planning Alibaba news DAG");
        const planned = await planDagLaunchFromGoal(ALIBABA_NEWS_GOAL);
        const subtasks = planned.payload.subtasks ?? [];

        runner.logEvent("plan", `Generated ${subtasks.length} subtasks`);
        runner.logEvent(
          "plan_detail",
          JSON.stringify(
            subtasks.map((task) => ({
              id: task.id,
              title: task.title,
              dependsOn: task.dependsOn ?? task.depends_on ?? [],
              siteKey: detectSiteKey(task),
            })),
            null,
            2,
          ),
        );

        assert.ok(subtasks.length >= 5, "Should generate at least 4 collection tasks + 1 synthesis task");

        const plannedSiteKeys = new Set<string>();
        for (const task of subtasks) {
          const siteKey = detectSiteKey(task);
          if (siteKey) {
            plannedSiteKeys.add(siteKey);
          }
        }

        assert.ok(
          plannedSiteKeys.size >= 3,
          `Should cover at least 3 source types in the plan, found: ${Array.from(plannedSiteKeys).join(", ")}`,
        );

        const synthesisTask = subtasks.find((task) => (task.dependsOn ?? task.depends_on ?? []).length >= 3);
        assert.ok(synthesisTask, "Should have a synthesis task depending on multiple collection tasks");

        runner.logEvent("phase", "Phase 2: Executing Alibaba news swarm");
        const sandboxTabDriver = runtime.createSandboxTabDriver?.();
        assert.ok(sandboxTabDriver, "sandboxTabDriver is required for isolated_tabs mode");

        const autoCancelTimer = setTimeout(() => {
          runner.logEvent("cleanup", `Auto-cancelling swarm after ${Math.round(SWARM_AUTO_CANCEL_MS / 1000)}s`);
          orchestrator.cancelAgent(runtime.tabId).catch((error) => {
            runner.logEvent("cleanup_error", String(error));
          });
        }, SWARM_AUTO_CANCEL_MS);
        autoCancelTimer.unref?.();

        let runResult: any;
        try {
          runResult = await new Promise<any>((resolve, reject) => {
            orchestrator
              .runInCurrentTab({
                tabId: runtime.tabId,
                goal: ALIBABA_NEWS_GOAL,
                subtasks,
                executionMode: "isolated_tabs",
                maxParallelSubAgents: 4,
                sandboxTabDriver,
                onLog: (msg) => runner.logEvent("orchestrator", msg),
                onStep: (step) => {
                  const action = step?.update?.planner_output?.action;
                  if (step?.node === "planner" && action) {
                    runner.logEvent(
                      "step",
                      `${action.type}(${action.skill_name || ""}) - ${action.description || ""}`,
                    );
                  }
                },
                onFinish: resolve,
                onError: reject,
              })
              .catch(reject);
          });
        } finally {
          clearTimeout(autoCancelTimer);
          await orchestrator.cancelAgent(runtime.tabId).catch((error) => {
            runner.logEvent("cleanup_error", String(error));
          });
        }

        runner.logEvent("phase", "Phase 3: Verifying Alibaba news swarm result");
        const schedulerRuntime = runResult.scheduler_runtime;
        assert.ok(schedulerRuntime, "Missing scheduler_runtime in result");
        runner.logEvent(
          "dag_state",
          `Completed: ${schedulerRuntime.completed.length}, Failed: ${schedulerRuntime.failed.length}, Blocked: ${schedulerRuntime.blocked.length}`,
        );

        const finalSummary = extractSummary(runResult);
        runner.logEvent("final_summary", finalSummary);

        const degradedResolved = schedulerRuntime.failed.length > 0 && finalSummary.length >= 100;
        if (schedulerRuntime.blocked.length > 0 && !degradedResolved) {
          assert.fail(`DAG has blocked nodes without a usable degraded summary: ${schedulerRuntime.blocked.join(", ")}`);
        }

        assert.ok(finalSummary.length >= 100, "Final summary should have substantial Alibaba news analysis");
        assert.match(finalSummary, /阿里巴巴|Alibaba|BABA/i, "Final summary should mention Alibaba");

        const mentionedSourceCount = countMentionedSources(finalSummary);
        assert.ok(
          mentionedSourceCount >= 2,
          `Final synthesis should mention at least 2 source types, found ${mentionedSourceCount}`,
        );
      },
      { headless: false },
    );
  });
});
