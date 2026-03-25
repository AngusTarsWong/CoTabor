import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";

export const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Router] Aggregating Results ---");
  
  const { planner_output, watchdog_output } = state;
  const actionType = planner_output?.action?.type || "Unknown";
  
  let nextStepLog = "";

  const isWatchdogFailed = watchdog_output?.status === "FAIL";

  // IMPORTANT: The order of checking matters. We should check if the planner explicitly called finish.
  // Even if watchdog "passes" the finish action, we need to respect the planner's FINISHED status.
  
  // Also, check if state.status is already FINISHED (set by planner)
  const isFinished = state.status === "FINISHED" || actionType === "finish";

  if (isFinished) {
    console.log("   Planner Proposal: finish -> Graph will terminate.");
    nextStepLog = "End";
  } else if (isWatchdogFailed) {
    console.log("   WatchDog Audit: FAIL -> Routing to Cortex for visual recovery");
    nextStepLog = "Cortex (Fix)";
  } else {
    console.log(`   WatchDog Audit: PASS -> Action '${actionType}' succeeded.`);
    nextStepLog = "Memory (Next Loop)";
  }

  const logMessage = new AIMessage({
    content: `Router Decision: ${isFinished ? 'Task Finished' : (isWatchdogFailed ? 'Watchdog Failed' : 'Watchdog Passed')} -> Next: ${nextStepLog}`
  });

  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "watchdog",
      phase: "exit",
      ts: Date.now(),
      route: {
        watchdog_verdict: isWatchdogFailed ? "fail" : "pass",
        route_reason: nextStepLog,
        escalate_to: isWatchdogFailed ? "cortex" : undefined
      }
    });
  }

  return {
    messages: [logMessage],
    // If finished, force status to FINISHED to break loop.
    // If Watchdog failed, we enter recovery mode. 
    // Otherwise keep current status.
    status: isFinished ? "FINISHED" : (isWatchdogFailed ? "CORTEX_RECOVERY" : state.status)
  };
};
