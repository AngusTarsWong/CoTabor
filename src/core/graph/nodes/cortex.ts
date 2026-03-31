import { AgentState, AgentStateAnnotation } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { perception } from "../../../drivers/perception";

// --- Subgraph Nodes ---

const cortexPlannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Planner] Vision Recovery (Midsense) ---");

  const { watchdog_output, screenshot } = state;
  const reason = watchdog_output?.reason || "Unknown error";
  const tabId = state.meta_data?.tabId;

  const retryCount = state.cortex_retry_count || 0;
  console.log(`[Cortex] Retry Attempt: ${retryCount + 1}/3`);

  if (retryCount >= 3) {
    console.log("[Cortex] Max retries reached. Escalating to Replanner.");
    return {
      status: "NEEDS_REPLAN",
      last_error_context: `Cortex visual recovery failed after 3 attempts. Last error: ${reason}`,
      cortex_retry_count: 0,
    };
  }

  if (!screenshot) {
    console.log("[Cortex] No screenshot available. Escalating to Replanner.");
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
    `element needed to complete: ${state.request}`;

  console.log(`[Cortex] Locating element via Midsense: "${elementDescription}"`);

  const pos = await perception.locateElement({
    screenshot,
    description: elementDescription,
    tabId,
  });

  if (!pos) {
    console.log("[Cortex] Midsense could not locate element. Escalating to Replanner.");
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

  return {
    cortex_action: cortexAction,
    cortex_thought: cortexAction.description,
    cortex_retry_count: 1,
  };
};

const cortexExecutorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Executor] ---");
  const action = state.cortex_action;
  const tabId = state.meta_data?.tabId;
  
  if (state.status === "NEEDS_REPLAN") {
      return {}; // skip execution
  }
  
  if (!action || action.type === "give_up") {
     console.log("[Cortex Executor] Action is give_up, escalating.");
     return { status: "NEEDS_REPLAN" };
  }
  
  let success = false;
  if (tabId) {
    try {
      const cdpInput = new CdpInput(tabId);
      if (action.type === "click" && action.x !== undefined && action.y !== undefined) {
         await cdpInput.click(action.x, action.y);
         success = true;
      } else if (action.type === "type" && action.text) {
         await cdpInput.typeText(action.text);
         success = true;
      }
    } catch (e: any) {
       console.error(`[Cortex Executor] CDP Error: ${e.message}`);
    }
  } else {
     console.log(`[Cortex Executor] Mock execution of ${action.type}`);
     success = true;
  }
  
  // Capture new screenshot after execution
  let newScreenshot = state.screenshot;
  if (tabId && success) {
     try {
       const cdpTools = new CdpTools(tabId);
       newScreenshot = await cdpTools.captureScreenshot(80);
     } catch (e) {}
  }
  
  return {
      screenshot: newScreenshot,
      scratchpad: [{ action: action, success, timestamp: Date.now() }]
  };
};

const cortexEvaluatorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Evaluator] ---");
  
  if (state.status === "NEEDS_REPLAN") {
      return {};
  }
  
  // For simplicity, we assume the visual micro-operation fixed the immediate issue.
  // We switch back to RUNNING so the main Planner can take over ("用完即切回").
  // If the issue is not fixed, Watchdog in the main loop will catch it again.
  console.log("[Cortex Evaluator] Returning control to main Planner.");
  
  const logMessage = new AIMessage({
    content: `[Cortex] Executed visual recovery: ${state.cortex_thought}`
  });
  
  return {
      status: "RUNNING",
      cortex_retry_count: 0, // Reset since we are returning to main loop
      messages: [logMessage]
  };
};

// --- Build Subgraph ---
const cortexBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("cortex_planner", cortexPlannerNode)
  .addNode("cortex_executor", cortexExecutorNode)
  .addNode("cortex_evaluator", cortexEvaluatorNode);

cortexBuilder.addEdge(START, "cortex_planner");
cortexBuilder.addEdge("cortex_planner", "cortex_executor");
cortexBuilder.addEdge("cortex_executor", "cortex_evaluator");

cortexBuilder.addConditionalEdges("cortex_evaluator", (state: AgentState) => {
   if (state.status === "NEEDS_REPLAN") return END;
   if (state.status === "RUNNING") return END;
   return "cortex_planner"; // For internal loop if needed
});

export const cortexNode = cortexBuilder.compile();

/**
 * 皮层路由决策 (Cortex Router) - Legacy export, safe to remove if not used in main graph.
 */
export const cortexRouter = (state: AgentState): string => {
  if (state.status === "NEEDS_REPLAN") {
    return "replanner";
  }
  return "planner";
};
