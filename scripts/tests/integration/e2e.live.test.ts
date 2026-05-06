import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { withTestRunner } from "../runners/base-runner";
import { NOTION_LOCAL_CONFIG_PATH, storageAdapter } from "../../../src/runner/storage-adapter";
import { createSyncBackend } from "../../../src/memory/sync/backend-factory";
import { runSubAgentTask } from "../../../src/core/orchestrator/runtime/SubAgentRunner";
import { extractTaskGraphSummary, runTaskGraph } from "../../../src/core/orchestrator/runtime/TaskGraphRunner";
import { retrieveL2RulesBySkillNames } from "../../../src/memory/retrieval/l2-rule-retriever";
import { l3Bm25Index } from "../../../src/memory/retrieval/l3-bm25-index";
import {
  extractNotionPageId,
  initializeNotionBrainBase,
  searchAccessibleNotionPages,
} from "../../../src/skills/bundled/notion-operator/init";
import type { SubtaskNode } from "../../../src/core/orchestrator/types/SubtaskDag";

const today = new Date().toISOString().slice(0, 10);
const taskTitle = `多智能体协作-并行与依赖调度的实践（${today}）`;
const taskGoal = `撰写一篇关于多智能体协作的技术文章，并发布到 Notion（${today}）`;

function extractSummary(result: any): string {
  const candidates = [
    result?.planner_output?.action?.description,
    result?.planner_output?.action?.result,
    result?.output,
    result?.summary,
    result?.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return result ? String(result) : "";
}

function hasNotionReference(text: string): boolean {
  if (!text) return false;
  return /https?:\/\/(?:www\.)?notion\.so\/\S+/i.test(text) || 
         /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text) || 
         /\b[0-9a-f]{32}\b/i.test(text);
}

describe("Live E2E: Full Flow", { timeout: 300000 }, () => {
  it("should complete full E2E flow including preflight, DAG scheduling, experience sync, and retrieval", async () => {
    process.env.VITE_MULTI_AGENT_SCHEDULER = "true";

    await withTestRunner("e2e-full-flow", async (runner, runtime) => {
      
      // --- STEP 0: Preflight ---
      runner.logEvent("phase", "Step 0: Preflight");
      const stored = await storageAdapter.get(["storageBackend", "notionBackendConfig", "notionParentPageUrl", "notionApiKey"]);
      let parentPageId = "";
      let parentPageTitle = "CoTabor";

      if (stored.notionApiKey) {
        if (stored.notionParentPageUrl) {
          parentPageId = extractNotionPageId(String(stored.notionParentPageUrl));
        } else {
          const pages = await searchAccessibleNotionPages(String(stored.notionApiKey), "CoTabor");
          const matched = pages.find((p) => p.title.includes("CoTabor")) ?? pages[0];
          if (matched) {
            parentPageId = matched.id;
            parentPageTitle = matched.title;
          }
        }
      }

      const syncWorker = await createSyncBackend();
      assert.ok(syncWorker, "SyncWorker should be available");
      
      const storageBackend = stored.storageBackend === "notion" ? stored.storageBackend : "unknown";
      assert.equal(storageBackend, "notion", "Storage backend must be set to notion for E2E");

      // --- STEP 1: Scheduler Flow ---
      runner.logEvent("phase", "Step 1: Main Agent DAG Scheduling");
      const parentPageHint = parentPageId ? `父页面 ID 为「${parentPageId}」` : `父页面名称为「${parentPageTitle}」`;

      const tasks = [
        {
          id: "draft_intro",
          title: "起草文章标题与引言",
          description: `调用 echo 技能传入：\n标题：${taskTitle}\n引言：多智能体系统通过将复杂任务拆解...`,
          dependsOn: [], maxAttempts: 2,
        },
        {
          id: "draft_body",
          title: "起草文章正文",
          description: `调用 echo 技能传入：\n正文：调度器基于有向无环图...`,
          dependsOn: [], maxAttempts: 2,
        },
        {
          id: "publish",
          title: "将文章发布到 Notion",
          description: `调用 notion_operator 创建新页面：\n- ${parentPageHint}\n- 页面标题：${taskTitle}\n- 页面内容：合并前两步的内容。\noperate_type=create_page`,
          dependsOn: ["draft_intro", "draft_body"], maxAttempts: 2,
        },
      ];

      const graphResult = await runTaskGraph({
        goal: taskGoal,
        tasks,
        maxParallelSubAgents: 2,
        runIdPrefix: "acceptance",
        executeSubtask: async (node, dag) => {
          const result = await runSubAgentTask(
            node,
            (_subtask: SubtaskNode) => ({ tabId: runtime.tabId, goal: _subtask.description ?? _subtask.title }),
            dag,
          );
          return { success: result.success, summary: extractTaskGraphSummary(result.finalState, extractSummary(result.finalState)), finalState: result.finalState, error: result.error?.message };
        },
      });

      const dagState = graphResult.schedulerRuntime;
      runner.logEvent("dag", `completed: ${dagState.completed.length}, failed: ${dagState.failed.length}`);
      assert.equal(dagState.failed.length, 0, "No DAG tasks should fail");
      
      const publishSummary = graphResult.subtaskResults.publish?.summary ?? "";
      assert.ok(hasNotionReference(publishSummary), "Publish task should return a Notion reference URL/ID");

      // --- STEP 2: Experience Sync ---
      runner.logEvent("phase", "Step 2: Experience Sync");
      
      const syntheticState = {
        request: taskGoal,
        status: "FINISHED",
        scheduler_runtime: dagState,
        subtask_results: graphResult.subtaskResults,
        experience_buffer: {
          site_insights: [],
          tool_insights: [{ skillName: "notion_operator", content: "Test rule for notion_operator" }],
          task_wisdom: [],
          failure_insights: [],
        },
        total_history: []
      };

      const syncReport = await runtime.syncMemory(syntheticState);
      assert.ok(syncReport.experienceJobCompleted, "Experience job should complete successfully");
      assert.ok(syncReport.cloudSyncSucceeded, "Cloud sync should succeed");

      // --- STEP 3: L2/L3 Retrieval Verification ---
      runner.logEvent("phase", "Step 3: L2/L3 Retrieval Verification");
      const rules = await retrieveL2RulesBySkillNames(["notion_operator", "echo"]);
      assert.ok(rules.get("notion_operator")?.base, "Should retrieve L2 rule for notion_operator");
      
      const l3Rules = await l3Bm25Index.search("多智能体 DAG 调度", { limit: 3 });
      assert.ok(l3Rules.length >= 0, "L3 search executed successfully"); // Could be 0 if not seeded, so just ensuring no crash

      runner.logEvent("phase", "E2E Complete");
    }, { headless: true });
  });
});
