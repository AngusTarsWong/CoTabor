import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentStateAnnotation, AgentState } from "./state";
import {
  plannerNode,
  executorNode,
  watchdogNode,
  cortexNode,
  replannerNode,
  memoryNode
} from "./nodes";

// 1. 注册所有的节点，必须通过链式调用来让 TypeScript 推断出所有的 NodeName
const graphBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("watchdog", watchdogNode)
  .addNode("cortex", cortexNode)
  .addNode("replanner", replannerNode)
  .addNode("memory", memoryNode); // 记忆压缩节点

// 2. 核心骨架（边与条件路由）

// 起点：先进行记忆压缩/整理，然后进入 Planner
graphBuilder.addEdge(START, "memory");
graphBuilder.addEdge("memory", "planner");

// Planner 产出 Action 后，进入 Executor(尝试执行)
graphBuilder.addEdge("planner", "executor");

// Executor 完成后，进入 Watchdog(审查及感知更新DOM)
graphBuilder.addEdge("executor", "watchdog");

// Watchdog 审查后，直接作为条件路由决定下一步
graphBuilder.addConditionalEdges("watchdog", async (state: AgentState) => {
  const { status, watchdog_output } = state;

  // 1. 如果 Planner 说结束了，那就结束
  if (status === "FINISHED") {
    return END;
  }

  // 2. 如果 Watchdog 拦截报错，进入 Cortex (皮层纠错)
  if (status === "CORTEX_RECOVERY" || watchdog_output?.status === "FAIL") {
    return "cortex";
  }

  // 3. 如果出现了不可恢复的错误，直接结束
  if (status === "FAILED") {
    console.log("--- [Watchdog Routing] Execution failed, stopping graph. ---");
    return END;
  }

  // 4. 如果一切正常，进入记忆压缩节点，准备下一轮循环
  return "memory";
});

// Cortex 纠错后，根据情况决定是重试(Planner)还是重规划(Replanner)
graphBuilder.addConditionalEdges("cortex", async (state: AgentState) => {
  if (state.status === "NEEDS_REPLAN") {
    return "replanner";
  }
  return "planner"; 
});

// Replanner 完成后，重新回到 Planner 开始新的计划
graphBuilder.addEdge("replanner", "planner");

// 编译并导出可运行的 Graph
export const agentGraph = graphBuilder.compile();
