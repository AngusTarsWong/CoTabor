/**
 * Unit tests for parsePlannerResponse.
 *
 * This is a pure function with no external dependencies — it only needs
 * a content string, a filtered skills list, and a minimal state slice.
 * No LLM, no IndexedDB, no Chrome API.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePlannedAction, parsePlannerResponse } from "../../../src/core/planning/parsePlannerResponse.js";
import type { Skill } from "../../../src/skills/types.js";

function makeSkill(name: string): Skill {
  return {
    name,
    description: `${name} description`,
    role: "action",
    params: {},
    type: "local",
    execute: async () => null,
    getManual: async () => "",
  };
}

function makeSchemaSkill(name: string, requiredKey: string): Skill {
  return {
    name,
    description: `${name} description`,
    role: "query",
    params: {
      type: "object",
      properties: {
        [requiredKey]: {
          type: "string",
        },
      },
      required: [requiredKey],
      $schema: "http://json-schema.org/draft-07/schema#",
    } as any,
    type: "mcp",
    execute: async () => null,
    getManual: async () => "",
  };
}

const emptyState = { total_history: [], last_observation: null, task_list: [] };

describe("parsePlannerResponse — JSON parsing", () => {
  it("parses a clean call_skill action", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "call_skill", skill_name: "echo", params: { text: "hi" }, description: "Echo" }),
      [],
      emptyState,
    );
    assert.equal(action.type, "call_skill");
    assert.equal(action.skill_name, "echo");
    assert.deepEqual(action.params, { text: "hi" });
  });

  it("strips ```json markdown fence before parsing", () => {
    const { action } = parsePlannerResponse(
      "```json\n{\"type\":\"finish\",\"result\":\"done\"}\n```",
      [],
      emptyState,
    );
    assert.equal(action.type, "finish");
  });

  it("strips plain ``` fence before parsing", () => {
    const { action } = parsePlannerResponse(
      "```\n{\"type\":\"finish\",\"result\":\"done\"}\n```",
      [],
      emptyState,
    );
    assert.equal(action.type, "finish");
  });

  it("returns error action on invalid JSON", () => {
    const { action } = parsePlannerResponse("not json at all", [], emptyState);
    assert.equal(action.type, "error");
  });

  it("handles empty string gracefully", () => {
    const { action } = parsePlannerResponse("", [], emptyState);
    assert.equal(action.type, "error");
  });
});

describe("parsePlannerResponse — browser_* normalisation", () => {
  it("converts browser_click_index type to call_skill", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "browser_click_index", params: { index: 3 } }),
      [],
      emptyState,
    );
    assert.equal(action.type, "call_skill");
    assert.equal(action.skill_name, "browser_click_index");
  });

  it("converts any browser_* prefix to call_skill", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "browser_scroll_direction", params: { direction: "down" } }),
      [],
      emptyState,
    );
    assert.equal(action.type, "call_skill");
    assert.equal(action.skill_name, "browser_scroll_direction");
  });
});

describe("parsePlannerResponse — skill-name-as-type normalisation", () => {
  it("converts a known skill name used as type to call_skill", () => {
    const skills = [makeSkill("notion_operator")];
    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "notion_operator", params: { instruction: "search" } }),
      skills,
      emptyState,
    );
    assert.equal(action.type, "call_skill");
    assert.equal(action.skill_name, "notion_operator");
  });

  it("does not normalise unknown types", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "finish", result: "done" }),
      [makeSkill("echo")],
      emptyState,
    );
    assert.equal(action.type, "finish");
  });
});

describe("normalizePlannedAction — skill param normalization", () => {
  it("maps a single unexpected param key onto the skill required key", () => {
    const skills = [makeSchemaSkill("search_wikipedia", "query")];
    const action = normalizePlannedAction(
      {
        type: "call_skill",
        skill_name: "search_wikipedia",
        params: { keyword: "United States" },
      },
      skills,
    );
    assert.deepEqual(action.params, { query: "United States" });
  });

  it("preserves params when the required key is already present", () => {
    const skills = [makeSchemaSkill("search_wikipedia", "query")];
    const action = normalizePlannedAction(
      {
        type: "call_skill",
        skill_name: "search_wikipedia",
        params: { query: "United States" },
      },
      skills,
    );
    assert.deepEqual(action.params, { query: "United States" });
  });
});

describe("parsePlannerResponse — loop prevention", () => {
  it("converts repeated successful skill call to finish", () => {
    const state = {
      total_history: [
        {
          step: 1,
          action: { type: "call_skill", skill_name: "echo", params: { text: "hi" } },
          result: { success: true },
        },
      ],
      last_observation: { kind: "skill_result", skill_name: "echo" },
      task_list: [],
    } as any;

    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "call_skill", skill_name: "echo", params: { text: "hi" } }),
      [],
      state,
    );
    assert.equal(action.type, "finish");
    assert.match(action.result ?? "", /Planner detected a repeated/);
  });

  it("does not block repeat call when params differ", () => {
    const state = {
      total_history: [
        {
          step: 1,
          action: { type: "call_skill", skill_name: "echo", params: { text: "hi" } },
          result: { success: true },
        },
      ],
      last_observation: { kind: "skill_result", skill_name: "echo" },
      task_list: [],
    } as any;

    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "call_skill", skill_name: "echo", params: { text: "different" } }),
      [],
      state,
    );
    assert.equal(action.type, "call_skill");
  });

  it("does not block repeat call when last result was failure", () => {
    const state = {
      total_history: [
        {
          step: 1,
          action: { type: "call_skill", skill_name: "echo", params: { text: "hi" } },
          result: { success: false },
        },
      ],
      last_observation: { kind: "skill_result" },
      task_list: [],
    } as any;

    const { action } = parsePlannerResponse(
      JSON.stringify({ type: "call_skill", skill_name: "echo", params: { text: "hi" } }),
      [],
      state,
    );
    assert.equal(action.type, "call_skill");
  });
});

describe("parsePlannerResponse — spawn_subagent permissions", () => {
  it("keeps spawn_subagent for root agents", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({
        type: "spawn_subagent",
        subtasks: [{ id: "a", title: "A", goal: "Do A", dependsOn: [] }],
      }),
      [],
      { ...emptyState, meta_data: { allowSpawnSubagent: true } },
    );
    assert.equal(action.type, "spawn_subagent");
  });

  it("converts spawn_subagent to replan for sub agents", () => {
    const { action } = parsePlannerResponse(
      JSON.stringify({
        type: "spawn_subagent",
        subtasks: [{ id: "a", title: "A", goal: "Do A", dependsOn: [] }],
      }),
      [],
      { ...emptyState, meta_data: { swarmMode: true, allowSpawnSubagent: false } },
    );
    assert.equal(action.type, "replan");
    assert.equal(action.reason, "spawn_subagent_disabled");
  });
});

describe("parsePlannerResponse — task_list and finish summary", () => {
  it("appends plan summary to finish action when task_list is present", () => {
    const content = JSON.stringify({
      type: "finish",
      result: "all done",
      task_list: [
        { status: "已完成", goal: "写摘要" },
        { status: "已完成", goal: "发布到 Notion" },
      ],
    });
    const { action, updatedTaskList } = parsePlannerResponse(content, [], emptyState);
    assert.equal(action.type, "finish");
    assert.match(action.summary ?? "", /执行过程回顾/);
    assert.match(action.summary ?? "", /写摘要/);
    assert.equal(updatedTaskList.length, 2);
  });

  it("falls back to state.task_list when action has none", () => {
    const stateWithTasks = {
      ...emptyState,
      task_list: [{ status: "待办", goal: "初始任务" }] as any,
    };
    const { updatedTaskList } = parsePlannerResponse(
      JSON.stringify({ type: "call_skill", skill_name: "echo", params: {} }),
      [],
      stateWithTasks,
    );
    assert.equal(updatedTaskList.length, 1);
    assert.equal(updatedTaskList[0].goal, "初始任务");
  });
});
