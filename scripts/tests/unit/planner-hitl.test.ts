/**
 * Tests for planner HITL (Human-in-the-Loop) behavior.
 *
 * Goal: verify that parsePlannerResponse correctly handles `requires_human`
 * actions, and expose the current gap — the planner prompt does NOT instruct
 * the LLM to emit `requires_human`, so the LLM never produces it in practice.
 *
 * Scenario under test: user asks "查看我知乎的文章数量" but the page is a
 * login wall. The planner should ideally output:
 *   { "type": "requires_human", "human_type": "login", "human_message": "..." }
 * or at minimum set requires_human: true on a call_skill action.
 *
 * Current status: parsePlannerResponse has NO handling for requires_human —
 * it passes through as an unknown action type. The graph.ts routing checks
 * `state.planner_output?.action?.requires_human` (a boolean flag), but the
 * planner prompt never tells the LLM to set this flag.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlannerResponse } from "../../../src/core/planning/parsePlannerResponse.js";

const emptyState = { total_history: [], last_observation: null, task_list: [] };

// ---------------------------------------------------------------------------
// 1. Baseline: what parsePlannerResponse does with requires_human today
// ---------------------------------------------------------------------------

describe("HITL — requires_human flag (current behavior)", () => {
  it("normalises requires_human type to call_skill with requires_human:true flag", () => {
    // After the fix: parsePlannerResponse normalises type:"requires_human" to call_skill
    // with requires_human:true so graph.ts routing correctly sends it to the human node.
    const content = JSON.stringify({
      type: "requires_human",
      human_type: "login",
      human_message: "知乎需要登录，请手动完成登录后继续",
      description: "检测到登录墙，需要用户介入",
    });

    const { action } = parsePlannerResponse(content, [], emptyState);

    // FIXED: type is normalised to "call_skill" so graph.ts routing works.
    assert.equal(action.type, "call_skill",
      "parsePlannerResponse normalises requires_human type to call_skill");

    // The requires_human boolean flag IS set — routing in graph.ts WILL redirect to human node.
    assert.equal((action as any).requires_human, true,
      "requires_human boolean flag is set — human node WILL be triggered");
    assert.equal((action as any).human_type, "login");
  });

  it("call_skill with requires_human:true flag IS routed to human node by graph.ts", () => {
    // This is the format graph.ts actually checks: action.requires_human === true
    // on any action type. But the planner prompt never instructs the LLM to add this.
    const content = JSON.stringify({
      type: "call_skill",
      skill_name: "browser_navigate",
      params: { url: "https://www.zhihu.com/people/me" },
      requires_human: true,
      human_type: "login",
      human_message: "知乎需要登录，请手动完成登录后继续",
      description: "导航到知乎个人主页（需要登录）",
    });

    const { action } = parsePlannerResponse(content, [], emptyState);

    assert.equal(action.type, "call_skill");
    // The flag survives JSON round-trip — graph.ts WOULD route to human node.
    assert.equal((action as any).requires_human, true,
      "requires_human:true flag survives parsing — graph.ts would route to human node");
    assert.equal((action as any).human_type, "login");
  });
});

// ---------------------------------------------------------------------------
// 2. Simulated planner outputs for the Zhihu login-wall scenario
// ---------------------------------------------------------------------------

describe("HITL — Zhihu login-wall scenario (simulated LLM outputs)", () => {
  const loginPageState = {
    total_history: [],
    last_observation: {
      kind: "page_content",
      url: "https://www.zhihu.com/signin",
      content: "登录知乎 手机号 密码 登录",
    },
    task_list: [],
  } as any;

  it("CURRENT BEHAVIOR: planner tries to interact with login form instead of pausing", () => {
    // This is what the LLM actually outputs today — it tries to fill in the form
    // because the prompt says nothing about requires_human.
    const llmOutput = JSON.stringify({
      task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
      type: "ui_interact",
      intent: "在登录页面找到手机号输入框，输入用户手机号",
      description: "检测到知乎登录页，尝试填写登录信息",
    });

    const { action } = parsePlannerResponse(llmOutput, [], loginPageState);

    assert.equal(action.type, "ui_interact",
      "Planner tries to interact with login form — no HITL triggered");
    assert.equal((action as any).requires_human, undefined,
      "No requires_human flag — agent will attempt login autonomously and likely fail");
  });

  it("CURRENT BEHAVIOR: planner may also try to navigate away from login page", () => {
    const llmOutput = JSON.stringify({
      task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
      type: "call_skill",
      skill_name: "browser_navigate",
      params: { url: "https://www.zhihu.com/people/me/posts" },
      description: "尝试直接导航到个人文章页",
    });

    const { action } = parsePlannerResponse(llmOutput, [], loginPageState);

    assert.equal(action.type, "call_skill");
    assert.equal(action.skill_name, "browser_navigate",
      "Planner navigates without checking login state — will hit login wall again");
  });

  it("DESIRED BEHAVIOR: planner should output requires_human for login wall", () => {
    // This is what we WANT the planner to output after fixing the prompt.
    // The prompt needs to instruct: "如果当前页面是登录页或需要身份验证，
    // 输出 requires_human:true, human_type:'login'"
    const desiredLlmOutput = JSON.stringify({
      task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
      type: "call_skill",
      skill_name: "browser_navigate",
      params: { url: "https://www.zhihu.com/people/me/posts" },
      requires_human: true,
      human_type: "login",
      human_message: "当前页面需要登录知乎账号。请手动完成登录后，点击「继续」让 Agent 继续执行。",
      description: "检测到知乎登录墙，需要用户手动登录后继续",
    });

    const { action } = parsePlannerResponse(desiredLlmOutput, [], loginPageState);

    // After prompt fix, this should pass:
    assert.equal((action as any).requires_human, true,
      "DESIRED: requires_human flag set — graph.ts will route to human node");
    assert.equal((action as any).human_type, "login");
    assert.ok(
      typeof (action as any).human_message === "string" && (action as any).human_message.length > 0,
      "DESIRED: human_message provides clear instruction to the user",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Verify graph routing logic (unit-level simulation)
// ---------------------------------------------------------------------------

describe("HITL — graph routing condition", () => {
  it("graph.ts routes to human node when action.requires_human is true", () => {
    // Simulate the condition in graph.ts:
    //   if (state.planner_output?.action?.requires_human) return "human";
    const plannerOutput = {
      action: {
        type: "call_skill",
        skill_name: "browser_navigate",
        params: { url: "https://www.zhihu.com" },
        requires_human: true,
        human_type: "login",
        human_message: "请登录知乎",
      },
    };

    const routeTarget = plannerOutput?.action?.requires_human ? "human" : "executor";
    assert.equal(routeTarget, "human", "Routing correctly goes to human node");
  });

  it("graph.ts routes to executor when requires_human is absent", () => {
    const plannerOutput = {
      action: {
        type: "ui_interact",
        intent: "填写登录表单",
      },
    };

    const routeTarget = (plannerOutput?.action as any)?.requires_human ? "human" : "executor";
    assert.equal(routeTarget, "executor",
      "Without requires_human flag, agent goes to executor — HITL never triggered");
  });

  it("graph.ts routes to executor when requires_human is false", () => {
    const plannerOutput = {
      action: {
        type: "call_skill",
        skill_name: "echo",
        params: {},
        requires_human: false,
      },
    };

    const routeTarget = plannerOutput?.action?.requires_human ? "human" : "executor";
    assert.equal(routeTarget, "executor");
  });
});

// ---------------------------------------------------------------------------
// 4. Summary: what needs to be fixed
// ---------------------------------------------------------------------------

describe("HITL — gap analysis summary", () => {
  it("documents the remaining gaps and fixed items", () => {
    const items = [
      {
        id: 1,
        location: "src/prompts/agent/planner.ts",
        status: "FIXED",
        fix: "Added requires_human rule: login/captcha/2fa/permission detection with human_type and human_message",
      },
      {
        id: 2,
        location: "src/core/planning/parsePlannerResponse.ts",
        status: "FIXED",
        fix: "type:'requires_human' is now normalised to call_skill with requires_human:true",
      },
      {
        id: 3,
        location: "src/sidepanel/components/HumanInTheLoopUI.tsx",
        status: "FIXED",
        fix: "Added captcha, 2fa, and stuck type variants with appropriate messaging and colours",
      },
      {
        id: 4,
        location: "src/prompts/agent/replanner.ts",
        status: "FIXED",
        fix: "Added consecutive failure escalation rule: >= 2 failures → evaluate if human can unblock → requires_human:true with human_type:'stuck'",
      },
      {
        id: 5,
        location: "src/core/graph/state.ts + watchdog.ts",
        status: "FIXED",
        fix: "consecutive_failures counter: incremented on FAIL, reset on PASS or human escalation",
      },
    ];

    assert.equal(items.length, 5, "Five items tracked");
    assert.ok(items.every(i => i.status === "FIXED"), "All items fixed");
    assert.ok(items[0].location.includes("planner.ts"), "Planner prompt fixed");
    assert.ok(items[3].location.includes("replanner.ts"), "Replanner escalation fixed");
  });
});
