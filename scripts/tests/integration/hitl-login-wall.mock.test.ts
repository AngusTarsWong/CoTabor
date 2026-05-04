/**
 * Integration test: HITL login-wall scenario (Zhihu)
 *
 * Simulates the full graph execution when the agent hits a login wall.
 * Observes:
 * 1. Does the planner correctly emit requires_human when it sees a login page?
 * 2. Does the replanner emit requires_human after repeated failures?
 * 3. Does the graph route to the human node correctly?
 * 4. What happens when the planner pre-judges (emits requires_human before navigating)?
 */

import "dotenv/config";
import "fake-indexeddb/auto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMMocker } from "../mocks/llm";

if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

const loginPageMeta = {
  url: "https://www.zhihu.com/signin",
  page_content: "登录知乎 手机号 密码 登录 注册",
};

const normalPageMeta = {
  url: "https://www.google.com",
  page_content: "Google Search",
};

describe("HITL — Login Wall Integration (Mocked Graph)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: Planner correctly detects login page and emits requires_human
  // ─────────────────────────────────────────────────────────────────────────
  it("Scenario 1: planner emits requires_human when already on login page → routes to human node", async () => {
    const mocker = new LLMMocker();

    // Planner sees login page, correctly emits requires_human
    mocker.addRule({
      nodeMatch: "planner",
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
        type: "call_skill",
        skill_name: "browser_navigate",
        params: { url: "https://www.zhihu.com/people/me/posts" },
        requires_human: true,
        human_type: "login",
        human_message: "当前页面需要登录知乎账号，请手动完成登录后点击「继续」让 Agent 继续执行。",
        description: "检测到知乎登录页，需要用户手动登录后继续。",
      }),
    });

    const { agentGraph } = await import("../../../src/core/graph/graph");

    const initialState = {
      request: "查看我知乎的文章数量",
      task_list: [],
      total_history: [],
      scratchpad: [],
      status: "RUNNING" as const,
      messages: [],
      meta_data: loginPageMeta,
    };

    let interrupted = false;
    let interruptPayload: any = null;

    try {
      const stream = agentGraph.stream(initialState, {
        recursionLimit: 10,
        configurable: { thread_id: "test-hitl-scenario-1" },
      });

      for await (const chunk of await stream) {
        const nodeNames = Object.keys(chunk);
        console.log(`[Scenario 1] Node: ${nodeNames.join(", ")}`);

        // Check for interrupt (human node fires interrupt())
        if ("__interrupt__" in chunk) {
          interrupted = true;
          interruptPayload = chunk.__interrupt__?.[0]?.value;
          console.log(`[Scenario 1] INTERRUPT fired:`, JSON.stringify(interruptPayload));
          break;
        }
      }
    } catch (e: any) {
      // LangGraph throws on interrupt in some versions
      if (e?.message?.includes("interrupt") || e?.name === "GraphInterrupt") {
        interrupted = true;
        console.log(`[Scenario 1] Caught interrupt exception:`, e.message);
      } else {
        throw e;
      }
    } finally {
      mocker.destroy();
    }

    assert.ok(interrupted, "Graph should have been interrupted at the human node");
    if (interruptPayload) {
      assert.equal(interruptPayload.type, "login", "Interrupt type should be 'login'");
      assert.ok(typeof interruptPayload.message === "string" && interruptPayload.message.length > 0,
        "Interrupt should carry a human_message");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: Prompt fix — planner should NOT pre-judge before navigating
  // ─────────────────────────────────────────────────────────────────────────
  it("Scenario 2 (prompt fix): planner on non-login page should navigate first, not pre-trigger HITL", async () => {
    const mocker = new LLMMocker();

    // After prompt fix: planner on Google navigates first, no requires_human
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
        type: "call_skill",
        skill_name: "browser_navigate",
        params: { url: "https://www.zhihu.com/people/me/posts" },
        description: "导航到知乎个人文章页，等待页面加载后再判断是否需要登录。",
      }),
    });

    // Watchdog passes (navigation succeeded)
    mocker.addRule({
      nodeMatch: "watchdog",
      times: 1,
      response: JSON.stringify({ success: true, reason: "导航成功" }),
    });

    // Second planner turn: now on login page, correctly triggers HITL
    mocker.addRule({
      nodeMatch: "planner",
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
        type: "ui_interact",
        intent: "等待用户完成登录后继续",
        requires_human: true,
        human_type: "login",
        human_message: "当前页面是知乎登录页，请手动完成登录后点击「继续」让 Agent 继续执行。",
        description: "当前 URL 是 zhihu.com/signin，检测到登录页。",
      }),
    });

    const { agentGraph } = await import("../../../src/core/graph/graph");

    const initialState = {
      request: "查看我知乎的文章数量",
      task_list: [],
      total_history: [],
      scratchpad: [],
      status: "RUNNING" as const,
      messages: [],
      meta_data: normalPageMeta, // Start on Google, not login page
    };

    let interrupted = false;
    let interruptPayload: any = null;
    let firstActionType: string | undefined;

    try {
      const stream = agentGraph.stream(initialState, {
        recursionLimit: 15,
        configurable: { thread_id: "test-hitl-scenario-2-fixed" },
      });

      for await (const chunk of await stream) {
        const nodeNames = Object.keys(chunk);

        // Capture first planner action
        if (chunk.planner && !firstActionType) {
          firstActionType = chunk.planner?.planner_output?.action?.type;
          const hasRequiresHuman = chunk.planner?.planner_output?.action?.requires_human;
          console.log(`[Scenario 2] First planner action: ${firstActionType}, requires_human: ${hasRequiresHuman}`);
        }

        if ("__interrupt__" in chunk) {
          interrupted = true;
          interruptPayload = chunk.__interrupt__?.[0]?.value;
          console.log(`[Scenario 2] Interrupt at correct time:`, JSON.stringify(interruptPayload));
          break;
        }
      }
    } catch (e: any) {
      if (e?.message?.includes("interrupt") || e?.name === "GraphInterrupt") {
        interrupted = true;
      } else {
        throw e;
      }
    } finally {
      mocker.destroy();
    }

    // First action should be navigation, not HITL
    assert.equal(firstActionType, "call_skill", "First action should be navigation, not premature HITL");
    // HITL should eventually trigger after landing on login page
    assert.ok(interrupted, "HITL should trigger after navigating to login page");
    if (interruptPayload) {
      assert.equal(interruptPayload.type, "login");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Replanner emits requires_human after repeated failures
  // ─────────────────────────────────────────────────────────────────────────
  it("Scenario 3: replanner emits requires_human:stuck after consecutive failures", async () => {
    const mocker = new LLMMocker();

    // Planner tries to navigate (no requires_human — correct first step)
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
        type: "call_skill",
        skill_name: "browser_navigate",
        params: { url: "https://www.zhihu.com/people/me/posts" },
        description: "导航到知乎个人文章页",
      }),
    });

    // Watchdog: FAIL (skill failed)
    mocker.addRule({
      nodeMatch: "watchdog",
      times: 1,
      response: JSON.stringify({ success: false, reason: "导航失败，页面跳转到登录页" }),
    });

    // Replanner: detects consecutive failures, escalates to human
    mocker.addRule({
      nodeMatch: "replanner",
      times: 1,
      response: JSON.stringify({
        root_cause: "连续导航失败，页面被重定向到登录页，需要用户手动登录",
        recovery_action: {
          type: "call_skill",
          skill_name: "browser_navigate",
          params: { url: "https://www.zhihu.com/people/me/posts" },
          requires_human: true,
          human_type: "stuck",
          human_message: "Agent 已尝试多次导航到知乎个人页但均被重定向到登录页。请手动完成登录后点击「继续」。",
          description: "连续失败，升级人工介入",
        },
        new_strategy: "等待用户登录后重试",
      }),
    });

    const { agentGraph } = await import("../../../src/core/graph/graph");

    const initialState = {
      request: "查看我知乎的文章数量",
      task_list: [],
      total_history: [],
      scratchpad: [],
      status: "RUNNING" as const,
      messages: [],
      consecutive_failures: 2, // Pre-seed: already failed twice
      meta_data: loginPageMeta,
    };

    let interrupted = false;
    let interruptPayload: any = null;

    try {
      const stream = agentGraph.stream(initialState, {
        recursionLimit: 15,
        configurable: { thread_id: "test-hitl-scenario-3" },
      });

      for await (const chunk of await stream) {
        const nodeNames = Object.keys(chunk);
        console.log(`[Scenario 3] Node: ${nodeNames.join(", ")}`);

        if ("__interrupt__" in chunk) {
          interrupted = true;
          interruptPayload = chunk.__interrupt__?.[0]?.value;
          console.log(`[Scenario 3] INTERRUPT:`, JSON.stringify(interruptPayload));
          break;
        }
      }
    } catch (e: any) {
      if (e?.message?.includes("interrupt") || e?.name === "GraphInterrupt") {
        interrupted = true;
        console.log(`[Scenario 3] Caught interrupt exception`);
      } else {
        throw e;
      }
    } finally {
      mocker.destroy();
    }

    assert.ok(interrupted, "Graph should interrupt after replanner escalates to human");
    if (interruptPayload) {
      assert.equal(interruptPayload.type, "stuck", "Interrupt type should be 'stuck'");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Dead loop — planner keeps trying without requires_human (current bug)
  // ─────────────────────────────────────────────────────────────────────────
  it("Scenario 4 (BUG): planner loops on login page without escalating — hits MAX_REPLAN_COUNT and terminates", async () => {
    const mocker = new LLMMocker();

    // Planner always tries to interact with login form — never emits requires_human
    mocker.addRule({
      nodeMatch: "planner",
      response: JSON.stringify({
        task_list: [{ id: "1", goal: "查看知乎文章数量", status: "进行中" }],
        type: "ui_interact",
        intent: "在登录页面找到手机号输入框，输入用户手机号",
        description: "检测到知乎登录页，尝试填写登录信息",
      }),
    });

    // Watchdog always fails (can't fill login form without credentials)
    mocker.addRule({
      nodeMatch: "watchdog",
      response: JSON.stringify({ success: false, reason: "无法自动填写登录表单，缺少用户凭据" }),
    });

    // Replanner also keeps trying (no requires_human instruction)
    mocker.addRule({
      nodeMatch: "replanner",
      response: JSON.stringify({
        root_cause: "登录表单填写失败",
        recovery_action: {
          type: "ui_interact",
          intent: "重新尝试找到登录按钮",
          description: "重试登录",
        },
        new_strategy: "换一种方式尝试登录",
      }),
    });

    const { agentGraph } = await import("../../../src/core/graph/graph");

    const initialState = {
      request: "查看我知乎的文章数量",
      task_list: [],
      total_history: [],
      scratchpad: [],
      status: "RUNNING" as const,
      messages: [],
      meta_data: loginPageMeta,
    };

    let finalStatus: string | undefined;
    let replanCount = 0;
    let interrupted = false;

    try {
      const finalState = await agentGraph.invoke(initialState, {
        recursionLimit: 30,
        configurable: { thread_id: "test-hitl-scenario-4" },
      });
      finalStatus = finalState.status;
      replanCount = finalState.replan_count ?? 0;
      console.log(`[Scenario 4] Final status: ${finalStatus}, replan_count: ${replanCount}`);
    } catch (e: any) {
      if (e?.message?.includes("interrupt") || e?.name === "GraphInterrupt") {
        interrupted = true;
        console.log(`[Scenario 4] Unexpected interrupt`);
      } else if (e?.message?.includes("Recursion limit")) {
        console.log(`[Scenario 4] Hit recursion limit — infinite loop confirmed`);
        finalStatus = "LOOP";
      } else {
        console.log(`[Scenario 4] Error: ${e.message}`);
        finalStatus = "ERROR";
      }
    } finally {
      mocker.destroy();
    }

    // BUG: without requires_human, the agent loops until MAX_REPLAN_COUNT then terminates
    // It never asks the user for help
    assert.ok(!interrupted, "BUG: no HITL triggered — agent loops silently");
    console.log(`[Scenario 4] BUG CONFIRMED: agent looped ${replanCount} times without asking for human help, final status: ${finalStatus}`);
  });
});
