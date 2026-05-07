import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentStateAnnotation, AgentState } from "./state";
import {
  plannerNode,
  executorNode,
  watchdogNode,
  cortexNode,
  replannerNode,
  humanNode,
  shouldStopAtNodeEntry,
} from "./nodes";

// Register nodes via chaining so TypeScript can infer the full node-name union.
const graphBuilder = new StateGraph(AgentStateAnnotation)
  .addNode("planner", plannerNode)
  .addNode("executor", executorNode)
  .addNode("watchdog", watchdogNode)
  .addNode("cortex", cortexNode)
  .addNode("replanner", replannerNode)
  .addNode("human", humanNode);

// Shared replan cap used by both Watchdog and Cortex routing.
const MAX_REPLAN_COUNT = 3;

// Core graph topology and conditional routing.
graphBuilder.addEdge(START, "planner");

// Route planner output either to human approval or direct execution.
graphBuilder.addConditionalEdges("planner", async (state: AgentState) => {
  if (shouldStopAtNodeEntry(state) || state.status === "STOPPED") {
    return END;
  }
  if (state.status === "FAILED") {
    return END;
  }
  const actionType = state.planner_output?.action?.type;
  if (actionType === "replan") {
    return "planner";
  }
  if (actionType === "finish") {
    return END;
  }
  if (state.planner_output?.action?.requires_human) {
    return "human";
  }
  return "executor";
});

// After human review, continue execution or return to planning.
graphBuilder.addConditionalEdges("human", async (state: AgentState) => {
  if (shouldStopAtNodeEntry(state) || state.status === "STOPPED") {
    return END;
  }
  if (state.meta_data?.human_cancelled) {
    return "planner";
  }
  return "executor";
});

// Every execution step is audited by Watchdog next.
graphBuilder.addConditionalEdges("executor", async (state: AgentState) => {
  if (shouldStopAtNodeEntry(state) || state.status === "STOPPED") {
    return END;
  }
  return "watchdog";
});

// Watchdog decides whether to finish, recover, or continue.
graphBuilder.addConditionalEdges("watchdog", async (state: AgentState) => {
  const { status, watchdog_output } = state;

  if (shouldStopAtNodeEntry(state) || status === "STOPPED") {
    return END;
  }

  // Honor terminal completion immediately.
  if (status === "FINISHED") {
    return END;
  }

  // API/tool failures should go straight to replanning instead of visual recovery.
  if (watchdog_output?.status === "FAIL") {
    const actionType = state.planner_output?.action?.type;
    const isSkillFailure =
      actionType === "call_skill" ||
      (typeof actionType === "string" && actionType.startsWith("browser_"));
    if (isSkillFailure) {
      if ((state.replan_count ?? 0) >= MAX_REPLAN_COUNT) {
        console.warn(`[Watchdog Routing] replan_count=${state.replan_count} >= ${MAX_REPLAN_COUNT}, forcing termination.`);
        return END;
      }
      return "replanner";
    }
  }

  // UI interaction failures are eligible for Cortex recovery.
  if (status === "CORTEX_RECOVERY" || watchdog_output?.status === "FAIL") {
    return "cortex";
  }

  // Stop immediately on unrecoverable failure.
  if (status === "FAILED") {
    console.log("--- [Watchdog Routing] Execution failed, stopping graph. ---");
    return END;
  }

  // Otherwise continue the main loop.
  return "planner";
});

// Cortex either returns to planning or escalates to replanning.
graphBuilder.addConditionalEdges("cortex", async (state: AgentState) => {
  if (shouldStopAtNodeEntry(state) || state.status === "STOPPED") {
    return END;
  }
  if (state.status === "NEEDS_REPLAN") {
    if ((state.replan_count ?? 0) >= MAX_REPLAN_COUNT) {
      console.warn(`[Graph] replan_count=${state.replan_count} >= ${MAX_REPLAN_COUNT}, forcing termination to break loop.`);
      return END;
    }
    return "replanner";
  }
  return "planner";
});

graphBuilder.addConditionalEdges("replanner", async (state: AgentState) => {
  if (shouldStopAtNodeEntry(state) || state.status === "STOPPED") {
    return END;
  }
  if (state.planner_output?.action?.requires_human) {
    return "human";
  }
  return "executor";
});

// Compile the runnable graph with checkpoint support for interrupt/resume.
const checkpointer = new MemorySaver();
export const agentGraph = graphBuilder.compile({ checkpointer });
