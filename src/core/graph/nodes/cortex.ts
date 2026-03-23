import { AgentState, AgentStateAnnotation } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import OpenAI from "openai";
import { ENV } from "../../../shared/constants/env";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";

// --- Subgraph Nodes ---

const cortexPlannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Cortex: Planner] Vision Recovery ---");
  const { watchdog_output, request, screenshot } = state;
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

  let cortexAction = { type: "unknown", description: "fallback" };
  let thought = `Analyzing failure: ${reason}`;

  let llmPayload: any = null;

  try {
    const config = ENV.CORTEX_CONFIG;
    if (!config.enabled) {
      throw new Error("Cortex model is disabled.");
    }
    
    if (screenshot) {
      const openai = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        dangerouslyAllowBrowser: true
      });
      
      const prompt = `The previous action failed. We are in visual recovery mode.
Goal: ${state.request}
Failure Context: ${state.last_error_context || "Unknown"}
Recent scratchpad attempts: ${JSON.stringify(state.scratchpad)}

Look at the screenshot. Identify if you can fix the issue by clicking a coordinate or typing text.
Output your action in this JSON format:
- { "type": "click", "x": number, "y": number, "description": "why" }
- { "type": "type", "text": string, "description": "why" }
- { "type": "give_up", "description": "Cannot recover visually" }

Respond in strictly valid JSON format.`;

      console.log("[Cortex] Querying Multimodal LLM...");
      const messages: any[] = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${screenshot}` } }
          ]
        }
      ];
      const payload = {
        model: config.modelName,
        messages: messages,
        temperature: 0.1,
        response_format: { type: "json_object" }
      };

      const completion = await openai.chat.completions.create(payload as any);
      
      const content = completion.choices[0].message.content || "{}";
      cortexAction = JSON.parse(content);
      thought = cortexAction.description || "Parsed action";
      
      llmPayload = {
        node: 'cortex',
        timestamp: Date.now(),
        payload: { ...payload, messages: [{ role: 'user', content: '[Prompt + Screenshot]' }] }, // Avoid saving huge base64 in logs
        response: content
      };
    } else {
       console.log("[Cortex] No screenshot available. Emulating fallback.");
       cortexAction = { type: "give_up", description: "No screenshot provided" };
    }
  } catch (error: any) {
    console.error(`[Cortex Planner] Error: ${error.message}`);
    cortexAction = { type: "give_up", description: `LLM error: ${error.message}` };
  }

  console.log(`[Cortex] Decided Action: ${JSON.stringify(cortexAction)}`);

  return {
    cortex_action: cortexAction,
    cortex_thought: thought,
    cortex_retry_count: 1, // this will accumulate because of the reducer
    llm_payloads: llmPayload ? [llmPayload] : []
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
