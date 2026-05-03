import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

if (!process.env.VITE_MULTI_AGENT_SCHEDULER) {
  process.env.VITE_MULTI_AGENT_SCHEDULER = "true";
}

import { withTestRunner } from "../runners/base-runner";
import { orchestrator } from "../../../src/core/orchestrator/AgentOrchestrator";
import { planDagLaunchFromGoal } from "../../../src/core/orchestrator/planning/DagLaunchPlanner";
import { NEWS_SITES, MULTI_NEWS_GOAL } from "../fixtures/news-sites";
import type { TaskGraphTaskInput } from "../../../src/core/orchestrator/types/TaskGraph";

// --- Helper Functions from original script ---
function detectSiteKey(task: TaskGraphTaskInput): string | undefined {
  const text = [task.id, task.title, task.goal, task.description].filter(Boolean).join(" ");
  return NEWS_SITES.find((site) => site.patterns.some((pattern) => pattern.test(text)))?.key;
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

// --- The Test Suite ---
describe("Live E2E: Multi-Source News DAG", { timeout: 600000 }, () => {
  it("should successfully plan and execute a multi-source news synthesis DAG in isolated tabs", async () => {
    await withTestRunner("multi-news-dag", async (runner, runtime) => {
      
      runner.logEvent("phase", "Phase 1: Planning DAG");
      const planned = await planDagLaunchFromGoal(MULTI_NEWS_GOAL);
      
      const subtasks = planned.payload.subtasks ?? [];
      runner.logEvent("plan", `Generated ${subtasks.length} subtasks`);
      
      // Basic assertions on the plan
      assert.ok(subtasks.length >= 5, "Should generate at least 4 source tasks + 1 synthesis task");
      
      const siteTaskIds = new Set<string>();
      for (const task of subtasks) {
        const siteKey = detectSiteKey(task);
        if (siteKey) siteTaskIds.add(task.id!);
      }
      
      assert.ok(siteTaskIds.size >= 3, "Should detect at least 3 distinct news sources in the plan");

      // Verify synthesis node exists
      const synthesisTaskId = subtasks.find(t => 
        (t.dependsOn || t.depends_on || []).length >= 3
      )?.id;
      assert.ok(synthesisTaskId, "Should have a synthesis task depending on source tasks");

      runner.logEvent("phase", "Phase 2: Executing DAG");
      const sandboxTabDriver = runtime.createSandboxTabDriver?.();
      assert.ok(sandboxTabDriver, "sandboxTabDriver is required for isolated_tabs mode");

      const runResult = await new Promise<any>((resolve, reject) => {
        orchestrator.runInCurrentTab({
          tabId: runtime.tabId,
          goal: MULTI_NEWS_GOAL,
          subtasks: subtasks,
          executionMode: "isolated_tabs",
          maxParallelSubAgents: 4,
          sandboxTabDriver,
          onLog: (msg) => runner.logEvent("orchestrator", msg),
          onStep: (step) => {
            const action = step?.update?.planner_output?.action;
            if (step?.node === "planner" && action) {
              runner.logEvent("step", `${action.type}(${action.skill_name || ''}) — ${action.description || ''}`);
            }
          },
          onFinish: resolve,
          onError: reject,
        }).catch(reject);
      });

      runner.logEvent("phase", "Phase 3: Verifying Results");
      const schedulerRuntime = runResult.scheduler_runtime;
      assert.ok(schedulerRuntime, "Missing scheduler_runtime in result");
      
      runner.logEvent("dag_state", `Completed: ${schedulerRuntime.completed.length}, Failed: ${schedulerRuntime.failed.length}`);

      // We allow degraded resolution (some failed nodes) but not blocked nodes without resolution
      const degradedResolved = schedulerRuntime.failed.length > 0 && Boolean(extractSummary(runResult));
      if (schedulerRuntime.blocked.length > 0 && !degradedResolved) {
        assert.fail(`DAG has blocked nodes: ${schedulerRuntime.blocked.join(", ")}`);
      }

      const finalSummary = extractSummary(runResult);
      runner.logEvent("final_summary", finalSummary);
      
      assert.ok(finalSummary.length > 50, "Final summary should have substantial content");

      // Verify at least some sources are mentioned
      const requiredKeywords = ["Google", "Bing", "BBC", "百度"];
      const matched = requiredKeywords.filter((keyword) => finalSummary.includes(keyword));
      assert.ok(matched.length >= 2, `Synthesis should mention at least 2 sources, found: ${matched.join(", ")}`);
      
    }, { headless: false }); // Force non-headless to observe visually during live tests
  });
});
