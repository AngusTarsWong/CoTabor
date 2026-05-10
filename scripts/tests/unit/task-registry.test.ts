import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { taskRegistry } from "../../../src/tasks/registry.ts";

describe("taskRegistry", () => {
  it("registers built-in maintainer tasks", () => {
    const tasks = taskRegistry.list();

    assert.ok(tasks.some((task) => task.id === "google-news-to-notion"));
  });

  it("builds the google news to notion task goal with params", () => {
    const task = taskRegistry.get("google-news-to-notion");

    assert.ok(task);
    assert.match(task.buildGoal({ topic: "AI" }), /AI/);
    assert.match(task.buildGoal({ topic: "AI" }), /notion_operator/);
  });
});
