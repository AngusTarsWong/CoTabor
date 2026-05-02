
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAgentLaunchInput } from "../../../src/core/orchestrator/launch-request.js";

describe("parseAgentLaunchInput", () => {
  it("plain text stays in single mode", () => {
    const result = parseAgentLaunchInput("帮我总结一下这个页面");
    assert.equal(result.mode, "single");
    assert.equal(result.goal, "帮我总结一下这个页面");
  });

  it("JSON dag payload is parsed into dag mode", () => {
    const result = parseAgentLaunchInput(
      JSON.stringify({
        mode: "dag",
        goal: "发布任务",
        subtasks: [
          { id: "a", title: "A" },
          { id: "b", title: "B", dependsOn: ["a"] },
        ],
        maxParallelSubAgents: 3,
        executionMode: "single_page_serial",
      }),
    );
    assert.equal(result.mode, "dag");
    assert.equal(result.goal, "发布任务");
    assert.equal(result.subtasks?.length, 2);
    assert.equal(result.maxParallelSubAgents, 3);
    assert.equal(result.executionMode, "single_page_serial");
  });

  it("fenced JSON dag payload is supported", () => {
    const result = parseAgentLaunchInput(
      '```json\n{"goal":"流程","tasks":[{"id":"a","title":"A"}]}\n```',
    );
    assert.equal(result.mode, "dag");
    assert.equal(result.subtasks?.[0]?.id, "a");
  });

  it("empty string defaults to single mode with empty goal", () => {
    const result = parseAgentLaunchInput("");
    assert.equal(result.mode, "single");
  });
});
