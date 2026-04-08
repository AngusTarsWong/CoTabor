import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentStateAnnotation, AgentState } from "./state";
import {
  plannerNode,
  executorNode,
  watchdogNode,
  cortexNode,
  replannerNode,
  memoryNode,
  humanNode,
  experienceNode,
} from "./nodes";

// 1. 注册所有的节点，必须通过链式调用来让 TypeScript 推断出所有的 NodeName
const graphBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("watchdog", watchdogNode)
  .addNode("cortex", cortexNode)
  .addNode("replanner", replannerNode)
  .addNode("memory", memoryNode)
  .addNode("human", humanNode)
  .addNode("experience", experienceNode); // 专职“秘书”节点，负责数据提取与经验汇总

// 2. 核心骨架（边与条件路由）

// 起点：先进行记忆压缩/整理，然后进入 Planner
graphBuilder.addEdge(START, "memory");
graphBuilder.addEdge("memory", "planner");

// Planner 产出 Action 后，判断是否需要人工确认
graphBuilder.addConditionalEdges("planner", async (state: AgentState) => {
  if (state.planner_output?.action?.requires_human) {
    return "human";
  }
  return "executor";
});

// Human 节点完成后：用户确认则继续执行，用户取消则重新规划
graphBuilder.addConditionalEdges("human", async (state: AgentState) => {
  if (state.meta_data?.human_cancelled) {
    return "memory"; // 重新规划
  }
  return "executor"; // 继续执行
});

// Executor 完成后，进入 Watchdog(审查及感知更新DOM)
graphBuilder.addEdge("executor", "watchdog");

// Watchdog 审查后，直接作为条件路由决定下一步
graphBuilder.addConditionalEdges("watchdog", async (state: AgentState) => {
  const { status, watchdog_output } = state;

  // 1. 如果 Planner 说结束了，那就结束
  if (status === "FINISHED") {
    return "experience";
  }

  // 2. 如果 Watchdog 拦截报错，进入 Cortex (皮层纠错)
  if (status === "CORTEX_RECOVERY" || watchdog_output?.status === "FAIL") {
    return "cortex";
  }

  // 3. 如果出现了不可恢复的错误，直接结束
  if (status === "FAILED") {
    console.log("--- [Watchdog Routing] Execution failed, stopping graph. ---");
    return "experience";
  }

  // 4. 如果一切正常，进入记忆/规划逻辑 (Critical Path)
  return "memory";
});

// 经验提取 (全局复盘) 是最终节点，执行完即结束
graphBuilder.addEdge("experience", END);

// Cortex 纠错后，根据情况决定是重试(Planner)还是重规划(Replanner)
graphBuilder.addConditionalEdges("cortex", async (state: AgentState) => {
  if (state.status === "NEEDS_REPLAN") {
    return "replanner";
  }
  return "planner";
});

// Replanner 直接产出 recovery action，跳过 Planner 直达 Executor
graphBuilder.addEdge("replanner", "executor");

// 编译并导出可运行的 Graph（需要 Checkpointer 支持 interrupt/resume）
const checkpointer = new MemorySaver();
export const agentGraph = graphBuilder.compile({ checkpointer });
