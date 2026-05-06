import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildMemoryRefreshContext } from "../../../src/memory/service/build-memory-refresh-context.ts";
import { getMemoryRefreshResult } from "../../../src/memory/service/memory-refresh-service.ts";
import type { AgentState } from "../../../src/core/graph/state.ts";
import type { RetrievedMemoriesPayload } from "../../../src/memory/retrieval/retrieve-and-assemble-memories.ts";
import type { MemoryRefreshState } from "../../../src/memory/service/types.ts";
import type { MemoryItem } from "../../../src/shared/types/memory.ts";

function makeL1(id = "l1", instruction = "click submit"): MemoryItem {
  const now = Date.now();
  return {
    id,
    type: "L1_HINT",
    title: id,
    content: instruction,
    tags: ["domain:example.com"],
    stability: 1,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: {
      domain: "example.com",
      pathPattern: "/docs",
      elementSelector: "#submit",
      actionType: "click",
      executionCount: 3,
      successCount: 2,
      physicalInstruction: instruction,
    },
  };
}

function makeRetrievedMemories(): RetrievedMemoriesPayload {
  return {
    plannerContext: "[历史操作经验]\n- click submit",
    replannerContext: "[历史操作经验]\n- click submit",
    executorL1Hints: ["click submit"],
    l1Items: [makeL1()],
    l2Items: [],
    l3Items: [],
    antiPatternL3Items: [],
    l2Rules: ["browser_click_index: [通用] 先确认元素可见"],
    l3Matches: undefined,
  };
}

function makeRefreshState(overrides: Partial<MemoryRefreshState> = {}): MemoryRefreshState {
  return {
    lastRefreshAt: Date.now(),
    lastRefreshKey: "planner::https://example.com/docs::7::::browser_click_index::open settings::",
    plannerKey: "planner::https://example.com/docs::7::::browser_click_index::open settings::",
    replannerKey: "replanner::https://example.com/docs::7::::browser_click_index::open settings::",
    executorKey: "executor::https://example.com/docs::7::::browser_click_index::open settings::open settings::{}",
    lastUrl: "https://example.com/docs",
    lastBoundTabId: 7,
    lastTaskType: "",
    lastSkillSetFingerprint: "browser_click_index:index",
    lastIntentFingerprint: "open settings::{}",
    lastRequestFingerprint: "open settings",
    lastMode: "reuse",
    ...overrides,
  };
}

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    request: "Open settings",
    messages: [],
    total_history: [
      {
        step: 1,
        action: { type: "ui_interact", intent: "open settings" },
        result: null,
        step_summary: "进入设置入口",
        meta: { url: "https://example.com/docs" },
      },
    ],
    long_term_memory: { summary: "", notebook: {} },
    scratchpad: [],
    retrieved_memories: makeRetrievedMemories(),
    node_memory_usage: null,
    node_memory_details: null,
    memory_refresh_state: makeRefreshState(),
    planner_output: { action: { type: "ui_interact", intent: "open settings", params: {} } },
    watchdog_output: null,
    cortex_action: null,
    cortex_thought: null,
    cortex_memory_buffer: [],
    screenshot: "",
    task_list: [],
    use_multi_agent_scheduler: false,
    subtask_dag: null,
    scheduler_runtime: null,
    status: "RUNNING",
    stop_requested: false,
    stop_reason: null,
    stop_requested_at: null,
    error: null,
    llm_payloads: [],
    node_llm_payloads: [],
    debug_payloads: [],
    perception_mode: "DOM",
    cortex_retry_count: 0,
    last_error_context: null,
    replan_context: null,
    replan_count: 0,
    consecutive_failures: 0,
    meta_data: {
      url: "https://example.com/docs",
      boundTabId: 7,
      tabId: 7,
    },
    task_run_id: "run_test",
    task_type: "",
    last_observation: null,
    active_tab_id: 7,
    opened_tabs: [{ tabId: 7, title: "Docs", url: "https://example.com/docs" }],
    available_skills: [
      {
        name: "browser_click_index",
        description: "click by index",
        role: "action",
        params: { index: "target index" },
        type: "local",
        execute: async () => ({}),
        getManual: async () => "",
      },
    ],
    experience_buffer: { site_insights: [], tool_insights: [], task_wisdom: [] },
    ...overrides,
  } as AgentState;
}

describe("memory refresh context builder", () => {
  it("extracts normalized context from agent state", () => {
    const context = buildMemoryRefreshContext(makeState(), {
      consumer: "executor",
      reason: "execution",
    });

    assert.equal(context.consumer, "executor");
    assert.equal(context.currentDomain, "example.com");
    assert.equal(context.currentPath, "/docs");
    assert.equal(context.boundTabId, 7);
    assert.equal(context.plannedAction?.intent, "open settings");
    assert.equal(context.recentHistoryDigest.length, 1);
  });

  it("upgrades executor refresh reason to post_human when resume metadata is present", () => {
    const context = buildMemoryRefreshContext(
      makeState({
        meta_data: {
          url: "https://example.com/docs",
          boundTabId: 7,
          tabId: 7,
          memory_refresh_reason: "post_human",
        },
      }),
      {
        consumer: "executor",
        reason: "execution",
      }
    );

    assert.equal(context.reason, "post_human");
  });
});

describe("memory refresh service", () => {
  it("reuses planner memory when refresh state matches current context", async () => {
    const context = buildMemoryRefreshContext(makeState(), {
      consumer: "planner",
      reason: "entry",
    });

    const result = await getMemoryRefreshResult(context);

    assert.equal(result.telemetry.refreshMode, "reuse");
    assert.equal(result.telemetry.refreshed, false);
    assert.equal(result.statePatch.retrieved_memories.plannerContext, makeRetrievedMemories().plannerContext);
  });

  it("uses partial refresh for executor when only intent changes", async () => {
    const state = makeState({
      planner_output: { action: { type: "ui_interact", intent: "open advanced settings", params: {} } },
      memory_refresh_state: makeRefreshState({
        lastIntentFingerprint: "open settings::{}",
      }),
    });
    const context = buildMemoryRefreshContext(state, {
      consumer: "executor",
      reason: "execution",
    });

    const result = await getMemoryRefreshResult(context);

    assert.equal(result.telemetry.refreshMode, "partial");
    assert.equal(result.telemetry.refreshed, true);
  });
});
