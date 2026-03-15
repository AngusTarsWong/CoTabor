import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";

export const replannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Replanner (战略重构)] ---");
  
  const { request, scratchpad } = state;
  
  console.log(`[Replanner] Original Goal: ${request}`);
  console.log(`[Replanner] Reviewing ${scratchpad.length} past failures from Cortex...`);

  // 1. 模拟 LLM 战略重规划
  const rootCause = "The current UI path is completely blocked or the element is permanently gone.";
  const newStrategy = "Restart the process from the home page using a different approach.";
  
  console.log(`[Replanner] Root Cause Analysis: ${rootCause}`);
  console.log(`[Replanner] New Strategy: ${newStrategy}`);

  // 2. 生成新的任务列表
  const newTaskList = [
    { id: 1, description: "Go back to Home Page", status: "pending" },
    { id: 2, description: "Retry the goal using a different search entry", status: "pending" }
  ];

  const logMessage = new AIMessage({
    content: `[Replanner] Strategic Plan Updated.\nRoot Cause: ${rootCause}\nNew Strategy: ${newStrategy}`
  });

  return {
    task_list: newTaskList,
    // 重规划完成后，清除短期的错误记忆，给系统一个干净的开始
    scratchpad: [], 
    // 清除上一次 planner 和 watchdog 的残留状态，避免死循环
    planner_output: null,
    watchdog_output: null,
    // 恢复状态为 RUNNING，交回 Router 重新调度
    status: "RUNNING",
    messages: [logMessage]
  };
};
