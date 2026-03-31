import { AgentState, AgentStateAnnotation } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { perception } from "../../../drivers/perception";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";

// --- Subgraph Nodes ---

const cortexPlannerAndExecutorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Vision Recovery] ---");

  const { watchdog_output, screenshot, request, meta_data } = state;
  const reason = watchdog_output?.reason || "Unknown error";
  const tabId = state.meta_data?.tabId;

  const retryCount = state.cortex_retry_count || 0;
  console.log(`[Cortex] Retry Attempt: ${retryCount + 1}/3`);

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
    };
  }

  if (!screenshot) {
    console.log("[Cortex] No screenshot available. Escalating to Replanner.");
    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      route: { escalate_to: "replanner", route_reason: "no screenshot" }
    });
    return {
      status: "NEEDS_REPLAN",
      last_error_context: "No screenshot available for visual recovery",
    };
  }

  // 从失败的历史记录中提取元素描述，作为 locateElement 的定位目标
  const lastStep = state.total_history[state.total_history.length - 1];
  const elementDescription =
    lastStep?.action?.description ||
    lastStep?.action?.params?.text ||
    `element needed to complete: ${request}`;

  console.log(`[Cortex] Locating element via Midsense: "${elementDescription}"`);

  emitTrace({
    node: "cortex",
    phase: "enter",
    ts: Date.now(),
    llm: { model_name: "midscene-internal", prompt_digest: `${reason}\n${elementDescription}` }
  });

  const pos = await perception.locateElement({
    screenshot,
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
    };
  }

  console.log(`[Cortex] Element located at (${pos.x}, ${pos.y}): ${pos.description ?? elementDescription}`);

  const cortexAction = {
    type: "click",
    x: pos.x,
    y: pos.y,
    description: `Midsense located and clicking: ${pos.description ?? elementDescription}`,
  };

  // Execute the click via CDP
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

  // Capture new screenshot after execution
  let newScreenshot = screenshot;
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
  };
};

const cortexEvaluatorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Evaluator] ---");

  if (state.status === "NEEDS_REPLAN") {
      emitTrace({
        node: "cortex",
        phase: "exit",
        ts: Date.now(),
        route: { escalate_to: "replanner", route_reason: "visual recovery failed" }
      });
      return {};
  }

  // 抢救成功，切回主干
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
      messages: [logMessage]
  };
};

// --- Build Subgraph ---
const cortexBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("cortex_planner_executor", cortexPlannerAndExecutorNode)
  .addNode("cortex_evaluator", cortexEvaluatorNode);

cortexBuilder.addEdge(START, "cortex_planner_executor");
cortexBuilder.addEdge("cortex_planner_executor", "cortex_evaluator");

cortexBuilder.addConditionalEdges("cortex_evaluator", (state: AgentState) => {
   if (state.status === "NEEDS_REPLAN") return END;
   if (state.status === "RUNNING") return END;
   return "cortex_planner_executor"; // For internal loop if needed
});

export const cortexNode = cortexBuilder.compile();

/**
 * 皮层路由决策 (Cortex Router)
 */
export const cortexRouter = (state: AgentState): string => {
  if (state.status === "NEEDS_REPLAN") {
    return "replanner";
  }
  return "planner";
};
