import { AgentState } from "../state";
import { END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";

export const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Router] Aggregating Results ---");
  
  const { planner_output, watchdog_output } = state;
  const actionType = planner_output?.action?.type || "Unknown";
  
  let shouldCommit = true;
  let nextStepLog = "";

  const isWatchdogFailed = watchdog_output?.status === "FAIL";

  // 核心投机执行逻辑 (Speculative Execution Gatekeeper)
  if (actionType === "finish") {
    // 优先级 1：如果 Planner 认为任务已完成，强制通过
    console.log("   Planner Proposal: finish (Overrides WatchDog)");
    shouldCommit = true;
    nextStepLog = "End";
  } else if (isWatchdogFailed) {
    // 优先级 2：如果 WatchDog 报错，拦截 Planner 的新计划
    console.log("   WatchDog Audit: FAIL -> Rollback Planner Action");
    shouldCommit = false;
    nextStepLog = "Cortex (Fix)";
  } else {
    // 优先级 3：正常通过
    console.log(`   WatchDog Audit: PASS -> Commit Action: ${actionType}`);
    shouldCommit = true;
    nextStepLog = "Executor";
  }

  const logMessage = new AIMessage({
    content: `Router Decision: ${isWatchdogFailed ? 'Watchdog Failed' : 'Watchdog Passed'} -> Next: ${nextStepLog}`
  });

  // 更新全局状态
  // 如果 WatchDog 失败，我们要把状态打上 FAILED 标签，供后续路由判断
  return {
    messages: [logMessage],
    status: shouldCommit ? state.status : "FAILED"
  };
};

/**
 * 路由决策函数 (Conditional Edge Function)
 */
export const routeDecision = (state: AgentState): string | string[] => {
  console.log("--- [Router] Dispatching Next Route ---");
  
  const plannerOut = state.planner_output;
  const actionType = plannerOut?.action?.type;

  // 1. 如果状态被标记为失败 (Watchdog 拦截 或 Executor 抛错)
  if (state.status === 'FAILED' || state.status === 'NEEDS_REPLAN') {
    return "cortex";
  }

  // 2. 如果任务完成
  if (actionType === "finish") {
    return "end";
  }

  // 3. 正常执行：触发 Executor 继续动作
  // 注意：如果是从 Replanner 过来的，它本身没有 plannerOut，我们需要清空 watchdog 历史或者重新回到 planner
  if (state.status === "RUNNING" && !plannerOut) {
     return "planner";
  }

  // 4. 兜底保护，如果找不到动作，就直接回到 planner
  if (!actionType || actionType === "Unknown") {
    return "planner";
  }

  // 5. 触发 Executor 和 Memory Compressor
  return ["executor", "memory_compressor"];
};
