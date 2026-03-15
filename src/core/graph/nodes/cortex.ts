import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";

export const cortexNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Cortex (皮层纠错)] ---");
  
  const { watchdog_output, request } = state;
  const reason = watchdog_output?.reason || "Unknown error";

  console.log(`[Cortex] Analyzing failure: ${reason}`);

  // 1. 模拟 LLM 反思过程
  const thought = `I failed because: ${reason}. Let me try to fix it by clicking another element first, or if I can't fix it, I will ask for a replan.`;
  
  console.log(`[Cortex] Thought: ${thought}`);

  // 2. 将错误信息写入 Scratchpad (短期脏内存)
  const newScratchpadItem = {
    error: reason,
    timestamp: Date.now(),
    thought: thought
  };

  // 3. 决定纠错动作
  // 这里我们用一个极简的策略：如果 scratchpad 里的错误不超过 2 次，我们就假装修好了（返回 RUNNING 交回 Planner）
  // 如果连续错误超过 2 次，我们就放弃战术修复，上升为战略重规划 (NEEDS_REPLAN)
  const currentErrorCount = state.scratchpad.length + 1;
  let nextStatus: AgentState['status'] = "RUNNING";
  let actionMessage = "Cortex suggests a minor fix and returns control to Planner.";

  if (currentErrorCount > 2) {
    console.log("[Cortex] Too many errors. Escalating to Replanner.");
    nextStatus = "NEEDS_REPLAN";
    actionMessage = "Cortex escalated the issue. Requesting a strategic Replan.";
  } else {
    console.log(`[Cortex] Minor fix applied. Attempt ${currentErrorCount}/2.`);
  }

  const logMessage = new AIMessage({
    content: `[Cortex Reflection] ${thought}\nAction: ${actionMessage}`
  });

  return {
    cortex_thought: thought,
    scratchpad: [newScratchpadItem], // 追加到 scratchpad (Reducer 会合并)
    status: nextStatus,
    messages: [logMessage]
  };
};

/**
 * 皮层路由决策 (Cortex Router)
 */
export const cortexRouter = (state: AgentState): string => {
  console.log("--- [Cortex Router] Deciding Next Step ---");
  if (state.status === "NEEDS_REPLAN") {
    console.log("   -> Routing to Replanner");
    return "replanner";
  }
  console.log("   -> Routing back to Planner");
  return "planner";
};
