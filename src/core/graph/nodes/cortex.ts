import { AgentState, AgentStateAnnotation } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { getVisionDriver } from "../../../drivers/vision";
import { emitTrace } from "../../../shared/utils/trace";

// --- Subgraph Nodes ---

const cortexPlannerAndExecutorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Vision Recovery] ---");
  const { watchdog_output, request, meta_data } = state;
  const reason = watchdog_output?.reason || "Unknown error";
  
  const retryCount = state.cortex_retry_count || 0;
  console.log(`[Cortex] Retry Attempt: ${retryCount + 1}/3`);
  
  if (retryCount >= 3) {
    console.log("[Cortex] Max retries reached. Escalating to Replanner.");
    return {
      status: "NEEDS_REPLAN",
      last_error_context: `Cortex visual recovery failed after 3 attempts. Last error: ${reason}`,
      cortex_retry_count: 0 // Reset for next time
    };
  }

  let cortexAction = { type: "midscene_recovery", description: "fallback" };
  let thought = `Analyzing failure: ${reason}`;
  let success = false;

  try {
    const visionDriver = getVisionDriver();
    
    // Ensure vision driver is initialized
    const tabId = meta_data?.tabId;
    if (tabId) {
      console.log(`[Cortex] Initializing Vision Driver for tab: ${tabId}`);
      await visionDriver.init({ type: 'chrome-extension', tabId: tabId });
    } else {
      console.warn("[Cortex] No tabId found in meta_data, Vision Driver initialization might fail if it requires one.");
    }
    
    const prompt = `The previous action failed. We are in visual recovery mode.
Goal: ${request}
Failure Context: ${state.last_error_context || "Unknown"}
Recent scratchpad attempts: ${JSON.stringify(state.scratchpad)}

Please help me recover and complete the next step to achieve the goal based on the visual context.`;

    emitTrace({
      node: "cortex",
      phase: "enter",
      ts: Date.now(),
      llm: {
        model_name: "midscene-internal",
        prompt_digest: `${reason}\n${request}`
      }
    });

    console.log("[Cortex] Invoking Vision Driver (Midscene) to plan and execute...");
    
    // Midscene 内部包含了规划和执行的闭环，因此我们直接调用 executeAction
    const result = await visionDriver.executeAction({
      instruction: prompt,
      context: { reason, last_error_context: state.last_error_context }
    });

    if (result.success) {
      console.log("[Cortex] Visual recovery succeeded.");
      success = true;
      thought = "Midscene successfully performed the recovery action.";
    } else {
      console.error(`[Cortex] Visual recovery failed: ${result.error}`);
      thought = `Midscene failed: ${result.error}`;
      success = false;
    }

    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      result: { status: success ? "success" : "fail" },
      action: { type: "midscene_recovery" }
    });

  } catch (error: any) {
    console.error(`[Cortex] Error: ${error.message}`);
    thought = `Error invoking Midscene: ${error.message}`;
    success = false;
    
    emitTrace({
      node: "cortex",
      phase: "exit",
      ts: Date.now(),
      result: { status: "fail", error_type: "vision_driver_error" },
      action: { type: "midscene_recovery" }
    });
  }

  return {
    cortex_action: cortexAction,
    cortex_thought: thought,
    cortex_retry_count: 1, // this will accumulate because of the reducer
    scratchpad: [{ action: cortexAction, success, timestamp: Date.now() }],
    status: success ? "RUNNING" : "NEEDS_REPLAN" // 成功则切回主干，失败则进入评估升级
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
