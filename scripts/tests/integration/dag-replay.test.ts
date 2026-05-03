import "fake-indexeddb/auto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listReplayableDagNodes, loadTaskRunReplaySnapshot } from "../../../src/core/orchestrator/replay/TaskRunReplay";
import { buildSubtaskDag } from "../../../src/core/orchestrator/planning/DependencyExtractor";
import { buildPartialDagReplayPayload, listReplayableDagBranches } from "../../../src/core/orchestrator/replay/DagPartialReplay";
import { persistDagNodeExecution } from "../../../src/memory/task-commit/dag-node-persistence";
import { parseAgentLaunchInput } from "../../../src/core/orchestrator/launch-request";

describe("Integration: DAG Replay", () => {
  it("should successfully persist and build replay payloads for failed DAG branches", async () => {
    const persistResult = await persistDagNodeExecution({
      dagRunId: "dag_replay_001",
      executionMode: "shared_tab",
      node: {
        id: "publish",
        title: "Publish article",
        dependsOn: ["draft_intro", "draft_body"],
        status: "succeeded",
        attempt: 1,
        maxAttempts: 1,
        metadata: { resourceProfile: "external_io" },
      },
      success: true,
      summary: "已成功发布到 Notion",
      finalState: {
        task_run_id: "run_replay_publish_001",
        request: "publish article",
        status: "FINISHED",
        total_history: [
          {
            step: 1,
            ts: 1000,
            node: "planner",
            action: { type: "call_skill", skill_name: "notion_operator" },
            result: { success: true, message: "planned" },
            step_summary: "准备调用 notion_operator",
          },
          {
            step: 2,
            ts: 2000,
            node: "executor",
            action: { type: "call_skill", skill_name: "notion_operator" },
            result: { success: true, message: "created" },
            step_summary: "创建 Notion 页面成功",
          },
        ],
      },
    });

    const replayableNodes = listReplayableDagNodes({
      subtask_dag: {
        nodes: {
          publish: {
            id: "publish",
            title: "Publish article",
          },
        },
      },
      subtask_results: {
        publish: {
          success: true,
          summary: "已成功发布到 Notion",
          taskRunId: persistResult.taskRunId,
        },
      },
    });

    assert.equal(replayableNodes.length, 1);
    assert.equal(replayableNodes[0].nodeId, "publish");
    assert.equal(replayableNodes[0].taskRunId, "run_replay_publish_001");

    const snapshot = await loadTaskRunReplaySnapshot("run_replay_publish_001");
    assert.equal(snapshot.taskRun.id, "run_replay_publish_001");
    assert.equal(snapshot.taskRun.dagRunId, "dag_replay_001");
    assert.equal(snapshot.rawTraces.length, 2);
    assert.ok(snapshot.replayGoal.includes("publish article"));

    const launchRequest = parseAgentLaunchInput(snapshot.replayGoal);
    assert.equal(launchRequest.mode, "single");
    assert.equal(launchRequest.goal, snapshot.replayGoal);

    const dag = buildSubtaskDag({
      tasks: [
        {
          id: "draft",
          title: "Draft article",
          description: "起草文章",
        },
        {
          id: "publish",
          title: "Publish article",
          description: "发布文章",
          dependsOn: ["draft"],
          resourceProfile: "external_io",
        },
        {
          id: "notify",
          title: "Notify channel",
          description: "通知频道",
          dependsOn: ["publish"],
        },
      ],
    });

    assert.equal(dag.nodes.publish.metadata?.originalTaskInput?.description, "发布文章");

    dag.nodes.draft.status = "succeeded";
    dag.nodes.publish.status = "failed";
    dag.nodes.notify.status = "blocked";

    const partialTargets = listReplayableDagBranches({
      goal: "发布文章工作流",
      dag_execution_mode: "shared_tab",
      dag_max_parallel_sub_agents: 2,
      subtask_dag: dag,
      scheduler_runtime: {
        runId: "scheduler_test",
        readyQueue: [],
        running: [],
        completed: ["draft"],
        failed: ["publish"],
        blocked: ["notify"],
        cancelRequested: false,
        paused: false,
        updatedAt: Date.now(),
      },
      subtask_results: {
        draft: { success: true, summary: "起草完成", taskRunId: "run_draft_001" },
        publish: { success: false, summary: "发布失败", taskRunId: "run_publish_001" },
      },
    });

    assert.equal(partialTargets.length, 1);
    assert.deepEqual(partialTargets[0].rerunNodeIds, ["publish", "notify"]);
    assert.deepEqual(partialTargets[0].reusedNodeIds, ["draft"]);

    const partialPayload = buildPartialDagReplayPayload({
      goal: "发布文章工作流",
      dag_execution_mode: "shared_tab",
      dag_max_parallel_sub_agents: 2,
      subtask_dag: dag,
      scheduler_runtime: {
        runId: "scheduler_test",
        readyQueue: [],
        running: [],
        completed: ["draft"],
        failed: ["publish"],
        blocked: ["notify"],
        cancelRequested: false,
        paused: false,
        updatedAt: Date.now(),
      },
      subtask_results: {
        draft: { success: true, summary: "起草完成", taskRunId: "run_draft_001" },
        publish: { success: false, summary: "发布失败", taskRunId: "run_publish_001" },
      },
    }, "publish");

    assert.equal(partialPayload.mode, "dag");
    assert.equal(partialPayload.subtasks?.length, 2);
    assert.equal(partialPayload.subtasks?.[0].id, "publish");
    assert.deepEqual(partialPayload.subtasks?.[0].dependsOn, []);
    assert.deepEqual(
      partialPayload.subtasks?.[0].metadata?.replayDependencyContext,
      [{ id: "draft", title: "Draft article", summary: "起草完成" }],
    );
    assert.equal(partialPayload.subtasks?.[1].id, "notify");
    assert.deepEqual(partialPayload.subtasks?.[1].dependsOn, ["publish"]);
  });
});
