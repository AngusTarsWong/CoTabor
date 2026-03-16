import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentStateAnnotation, AgentState } from "./state";
import {
  plannerNode,
  executorNode,
  watchdogNode,
  routerNode,
  cortexNode,
  replannerNode,
  memoryNode
} from "./nodes";

// 1. 注册所有的节点，必须通过链式调用来让 TypeScript 推断出所有的 NodeName
const graphBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("watchdog", watchdogNode)
  .addNode("router", routerNode)
  .addNode("cortex", cortexNode)
  .addNode("replanner", replannerNode)
  .addNode("memory", memoryNode); // 新增记忆压缩节点

// 0. 初始化技能 (在 Graph 启动前，最好在外部做，但这里可以做一个 Lazy Load)
// 实际上，available_skills 应该在 graph 的输入 state 中传入
// 我们可以在 memoryNode (起点) 中注入技能列表，或者在 START 之前注入
// 为了简单起见，我们假设外部调用 agentGraph.invoke 时会传入 available_skills
// 但为了保险，我们在 memoryNode 中做一个简单的注入 (如果 state 里没有的话)

// 2. 核心骨架（边与条件路由）

// 起点：先进行记忆压缩/整理，然后进入 Planner
graphBuilder.addEdge(START, "memory");
graphBuilder.addEdge("memory", "planner");

// Planner 产出 Action 后，"同时"进入 Executor(尝试执行) 和 Watchdog(审查)
graphBuilder.addEdge("planner", "executor");
graphBuilder.addEdge("planner", "watchdog");

// Executor 和 Watchdog 都完成后，汇聚到 Router 节点
graphBuilder.addEdge("executor", "router");
graphBuilder.addEdge("watchdog", "router");

// Router 根据 Planner 和 Watchdog 的结果，决定下一步去哪里
graphBuilder.addConditionalEdges("router", async (state: AgentState) => {
  const { status, planner_output, watchdog_output } = state;

  // 1. 如果 Planner 说结束了，且 Router 同意，那就结束
  if (status === "FINISHED") {
    return END;
  }

  // 1.1 如果 Planner 失败了，直接结束，避免死循环
  if (status === "FAILED") {
    console.log("--- [Router] Planner failed, stopping graph execution. ---");
    return END;
  }

  // 2. 如果 Watchdog 拦截报错，进入 Cortex (皮层纠错)
  if (watchdog_output?.status === "FAIL") {
    return "cortex";
  }

  // 3. 如果一切正常，进入记忆压缩节点，准备下一轮循环
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
