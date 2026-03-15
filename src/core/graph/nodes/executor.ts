import { AgentState } from "../state";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { HumanMessage } from "@langchain/core/messages";

export const executorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Executor] ---");
  
  const { planner_output, meta_data } = state;
  const tabId = meta_data?.tabId; // 从 meta_data 中获取目标 tabId

  if (!planner_output || !planner_output.action) {
    console.warn("[Executor] No action provided by planner.");
    return {
      status: "FAILED",
      error: "No valid action provided by planner"
    };
  }

  const action = planner_output.action;
  console.log(`[Executor] Executing action: ${action.type}`);

  let executionResult: any = { success: true };

  // 如果提供了 tabId，我们才真正调用 CDP，否则只打印日志（方便纯 Node 环境跑通 Graph）
  if (tabId) {
    try {
      const cdpInput = new CdpInput(tabId);
      
      // 1. 执行具体动作
      switch (action.type) {
        case "click":
          if (action.x !== undefined && action.y !== undefined) {
            await cdpInput.click(action.x, action.y);
          }
          break;
        case "type":
          if (action.text) {
            await cdpInput.typeText(action.text);
          }
          break;
        case "scroll":
          if (action.deltaX !== undefined && action.deltaY !== undefined) {
            await cdpInput.scroll(action.deltaX, action.deltaY);
          }
          break;
        case "finish":
          // do nothing
          break;
        default:
          console.warn(`[Executor] Unknown action type: ${action.type}`);
      }

      // 等待 UI 渲染 (模拟真实情况的延迟)
      await new Promise(r => setTimeout(r, 500));

    } catch (e: any) {
      console.error(`[Executor] Action execution failed: ${e.message}`);
      executionResult = { success: false, error: e.message };
    }
  } else {
    console.log("[Executor] Mock execution (No tabId provided)");
  }

  // 2. 执行后截图
  let newScreenshot = state.screenshot;
  if (tabId) {
    try {
      const cdpTools = new CdpTools(tabId);
      newScreenshot = await cdpTools.captureScreenshot(80);
      console.log("[Executor] Captured new screenshot.");
    } catch (e: any) {
      console.error(`[Executor] Failed to capture screenshot: ${e.message}`);
    }
  }

  // 3. 构建历史记录
  const stepId = state.total_history.length + 1;
  const historyItem = {
    step: stepId,
    action: action,
    result: { ...executionResult, screenshot: newScreenshot ? "<base64_hidden_for_log>" : null }
  };

  // 4. 构建 Message
  const messages = [
    new HumanMessage({
      content: `Execution Step ${stepId} Result: ${executionResult.success ? 'Success' : 'Failed'}`
    })
  ];

  console.log("--- [Executor] Execution Completed ---\n");

  return {
    total_history: [historyItem],
    screenshot: newScreenshot,
    messages: messages,
    // 如果 Executor 执行抛出异常，可以直接标记 FAILED 交给 Cortex
    status: executionResult.success ? state.status : "FAILED" 
  };
};
