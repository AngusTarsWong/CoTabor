import { AgentState, AgentStateAnnotation } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { perception } from "../../../drivers/perception";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

// --- Subgraph nodes ---

const cortexPlannerAndExecutorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Vision Recovery] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Cortex] Stop requested. Skipping recovery executor.");
    return buildStoppedState(state);
  }

  const { watchdog_output, screenshot, request, meta_data } = state;
  const reason = watchdog_output?.reason || "Unknown error";
  const tabId = state.meta_data?.tabId;

  const retryCount = state.cortex_retry_count || 0;
  console.log(`[Cortex] Retry Attempt: ${retryCount + 1}/3`);

  const buildRecoveryError = (message: string) =>
    `${message}. Original watchdog failure: ${reason}`;

  if (retryCount >= 3) {
    console.log("[Cortex] Max retries reached. Escalating to Replanner.");
    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      route: { escalate_to: "replanner", route_reason: "max retries reached" }
    });
    return {
      status: "NEEDS_REPLAN",
      last_error_context: `Cortex visual recovery failed after 3 attempts. Last error: ${reason}`,
      cortex_retry_count: 0,
      debug_payloads: [
        {
          node: "cortex",
          title: "视觉恢复失败",
          input: { reason, retryCount: retryCount + 1 },
          media: screenshot ? [{ title: "恢复失败时截图", mimeType: "image/jpeg", data: screenshot }] : [],
        },
      ],
    };
  }

  // Reuse the last failed action description as the locator target.
  const lastStep = state.total_history[state.total_history.length - 1];
  const actionText = typeof lastStep?.action?.params?.text === "string" ? lastStep.action.params.text : "";
  const elementDescription =
    lastStep?.action?.description ||
    actionText ||
    `element needed to complete: ${request}`;

  const requiresExternalScreenshot = perception.requiresExternalScreenshotForLocate();
  let workingScreenshot = screenshot;
  let screenshotCaptureError: string | null = null;

  if (!workingScreenshot && requiresExternalScreenshot && tabId) {
    try {
      const cdpTools = new CdpTools(tabId);
      workingScreenshot = await cdpTools.captureScreenshot(80);
      console.log("[Cortex] Captured missing screenshot before visual recovery.");
    } catch (e: any) {
      screenshotCaptureError = e?.message || String(e);
      console.warn(`[Cortex] Failed to capture missing screenshot: ${screenshotCaptureError}`);
    }
  }

  if (!workingScreenshot && requiresExternalScreenshot) {
    console.log("[Cortex] No screenshot available. Escalating to Replanner.");
    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      route: { escalate_to: "replanner", route_reason: "no screenshot" }
    });
    return {
      status: "NEEDS_REPLAN",
      last_error_context: buildRecoveryError(
        `Visual recovery unavailable: no screenshot${screenshotCaptureError ? ` (${screenshotCaptureError})` : ""}`,
      ),
      debug_payloads: [
        {
          node: "cortex",
          title: "视觉恢复缺少截图",
          input: { reason, elementDescription, requiresExternalScreenshot },
          output: { screenshotCaptureError },
        },
      ],
    };
  }

  console.log(`[Cortex] Locating element via Midsense: "${elementDescription}"`);

  emitTrace({
    node: "cortex",
    phase: "enter",
    ts: Date.now(),
    llm: { model_name: "midscene-internal", prompt_digest: `${reason}\n${elementDescription}` }
  });

  const pos = await perception.locateElement({
    screenshot: workingScreenshot || "",
    description: elementDescription,
    tabId,
  });

  if (!pos) {
    console.log("[Cortex] Midsense could not locate element. Escalating to Replanner.");
    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      result: { status: "fail" },
      route: { escalate_to: "replanner", route_reason: "element not located" }
    });
    return {
      status: "NEEDS_REPLAN",
      last_error_context: `Midsense could not locate: "${elementDescription}". Original error: ${reason}`,
      debug_payloads: [
        {
          node: "cortex",
          title: "视觉定位失败",
          input: { reason, elementDescription, hasScreenshot: Boolean(workingScreenshot), requiresExternalScreenshot },
        },
      ],
    };
  }

  console.log(`[Cortex] Element located at (${pos.x}, ${pos.y}): ${pos.description ?? elementDescription}`);

  const cortexAction = {
    type: "click",
    x: pos.x,
    y: pos.y,
    description: `Midsense located and clicking: ${pos.description ?? elementDescription}`,
  };

  // Execute the recovery click via CDP.
  let success = false;
  if (tabId) {
    try {
      const cdpInput = new CdpInput(tabId);
      await cdpInput.click(pos.x, pos.y);
      success = true;
    } catch (e: any) {
      console.error(`[Cortex] CDP click failed: ${e.message}`);
    }
  } else {
    success = true; // mock
  }

  // Capture a fresh screenshot after recovery.
  let newScreenshot = workingScreenshot;
  if (tabId && success) {
    try {
      const cdpTools = new CdpTools(tabId);
      newScreenshot = await cdpTools.captureScreenshot(80);
    } catch (e) {}
  }

  emitTrace({
    node: "cortex",
    phase: "exit",
    ts: Date.now(),
    result: { status: success ? "success" : "fail" },
    action: { type: "click" }
  });

  return {
    cortex_action: cortexAction,
    cortex_thought: cortexAction.description,
    cortex_retry_count: 1,
    scratchpad: [{ action: cortexAction, success, timestamp: Date.now() }],
    screenshot: newScreenshot,
    status: success ? "RUNNING" : "NEEDS_REPLAN",
    debug_payloads: [
      {
        node: "cortex",
        title: "视觉恢复输入输出",
        input: {
          reason,
          elementDescription,
          locatedPosition: pos,
          hasScreenshot: Boolean(workingScreenshot),
          requiresExternalScreenshot,
        },
        output: {
          success,
          cortexAction,
        },
        media: [
          ...(workingScreenshot ? [{ title: "恢复前截图", mimeType: "image/jpeg", data: workingScreenshot }] : []),
          ...(newScreenshot && newScreenshot !== workingScreenshot
            ? [{ title: "恢复后截图", mimeType: "image/jpeg", data: newScreenshot }]
            : []),
        ],
      },
    ],
  };
};

const cortexEvaluatorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Evaluator] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Cortex Evaluator] Stop requested. Skipping recovery evaluation.");
    return buildStoppedState(state);
  }

  if (state.status === "NEEDS_REPLAN") {
      emitTrace({
        node: "cortex",
        phase: "exit",
        ts: Date.now(),
        route: { escalate_to: "replanner", route_reason: "visual recovery failed" }
      });
      return {};
  }

  // Recovery succeeded, return to the main planning loop.
  console.log("[Cortex Evaluator] Returning control to main Planner.");

  const logMessage = new AIMessage({
    content: `[Cortex] Executed visual recovery: ${state.cortex_thought}`
  });
  emitTrace({
    node: "cortex",
    phase: "exit",
    ts: Date.now(),
    route: { route_reason: "return to planner" }
  });

  return {
      status: "RUNNING",
      cortex_retry_count: 0, // Reset since we are returning to main loop
      messages: [logMessage],
      debug_payloads: [
        {
          node: "cortex",
          title: "视觉恢复评估",
          output: {
            message: state.cortex_thought,
            route: "return_to_planner",
          },
          media: state.screenshot
            ? [{ title: "恢复评估截图", mimeType: "image/jpeg", data: state.screenshot }]
            : [],
        },
      ],
  };
};

// --- Build subgraph ---
const cortexBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("cortex_planner_executor", cortexPlannerAndExecutorNode)
  .addNode("cortex_evaluator", cortexEvaluatorNode);

cortexBuilder.addEdge(START, "cortex_planner_executor");
cortexBuilder.addEdge("cortex_planner_executor", "cortex_evaluator");

cortexBuilder.addConditionalEdges("cortex_evaluator", (state: AgentState) => {
   if (state.status === "STOPPED") return END;
   if (state.status === "NEEDS_REPLAN") return END;
   if (state.status === "RUNNING") return END;
   return "cortex_planner_executor";
});

export const cortexNode = cortexBuilder.compile();

/** Decide whether Cortex returns to Planner or escalates to Replanner. */
export const cortexRouter = (state: AgentState): string => {
  if (state.status === "NEEDS_REPLAN") {
    return "replanner";
  }
  return "planner";
};
