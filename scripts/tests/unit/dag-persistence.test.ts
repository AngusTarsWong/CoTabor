
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { persistDagNodeExecution } from "../../../src/memory/task-commit/dag-node-persistence.js";
import { memoryStore } from "../../../src/memory/store/indexeddb.js";

beforeEach(async () => {
  await (memoryStore as any)._clearAll();
});

describe("persistDagNodeExecution", () => {
  it("stores task run + raw traces, marks experience as SKIPPED for dag nodes", async () => {
    const result = await persistDagNodeExecution({
      dagRunId: "dag_persist_001",
      executionMode: "isolated_tabs",
      node: {
        id: "publish",
        title: "Publish article",
        dependsOn: ["draft_intro", "draft_body"],
        status: "succeeded",
        attempt: 1,
        maxAttempts: 2,
        metadata: { resourceProfile: "external_io" },
      },
      success: true,
      sandboxGroupId: 301,
      sandboxTabId: 901,
      summary: "published",
      finalState: {
        task_run_id: "run_publish_001",
        request: "publish article",
        status: "FINISHED",
        meta_data: { url: "https://www.notion.so/example", title: "Example" },
        total_history: [
          {
            step: 1,
            ts: 1000,
            node: "planner",
            action: { type: "call_skill", skill_name: "notion_operator" },
            result: { success: true, message: "planned" },
            step_summary: "planner summary",
            meta: { url: "https://www.notion.so/example" },
          },
          {
            step: 2,
            ts: 2000,
            node: "executor",
            action: { type: "call_skill", skill_name: "notion_operator" },
            result: { success: true, message: "created" },
            step_summary: "executor summary",
            meta: { url: "https://www.notion.so/example" },
          },
        ],
      },
    });

    assert.equal(result.taskRunId, "run_publish_001");
    assert.equal(result.traceCount, 2);

    const taskRuns = await memoryStore.getTaskRunsByDagRun("dag_persist_001");
    assert.equal(taskRuns.length, 1);
    assert.equal(taskRuns[0].dagNodeId, "publish");
    assert.equal(taskRuns[0].sandboxTabId, 901);
    assert.equal(taskRuns[0].experienceStatus, "SKIPPED");

    const pendingExperience = await memoryStore.getPendingExperienceTaskRuns();
    assert.equal(pendingExperience.length, 0);

    const rawTraces = await memoryStore.getRawTracesByDagRun("dag_persist_001");
    assert.equal(rawTraces.length, 2);
    assert.equal(rawTraces[0].dagNodeId, "publish");
    assert.equal(rawTraces[0].dagExecutionMode, "isolated_tabs");
  });

  it("generates a new task run id when finalState has none", async () => {
    const result = await persistDagNodeExecution({
      dagRunId: "dag_no_id",
      executionMode: "shared_tab",
      node: { id: "step1", title: "Step 1", dependsOn: [], status: "succeeded", attempt: 1, maxAttempts: 1, metadata: {} },
      success: true,
      summary: "ok",
      finalState: { request: "some task", status: "FINISHED", total_history: [] },
    });
    assert.ok(result.taskRunId.length > 0);
  });
});
