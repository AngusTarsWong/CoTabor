import { AgentState } from "../state";
import { AIMessage } from "@langchain/core/messages";

export const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Router] Aggregating Results ---");
  
  const { planner_output, watchdog_output } = state;
  const actionType = planner_output?.action?.type || "Unknown";
  
  let nextStepLog = "";

  const isWatchdogFailed = watchdog_output?.status === "FAIL";

  if (actionType === "finish") {
    console.log("   Planner Proposal: finish (Overrides WatchDog)");
    nextStepLog = "End";
  } else if (isWatchdogFailed) {
    console.log("   WatchDog Audit: FAIL -> Routing to Cortex for visual recovery");
    nextStepLog = "Cortex (Fix)";
  } else {
    console.log(`   WatchDog Audit: PASS -> Action '${actionType}' succeeded.`);
    nextStepLog = "Memory (Next Loop)";
  }

  const logMessage = new AIMessage({
    content: `Router Decision: ${isWatchdogFailed ? 'Watchdog Failed' : 'Watchdog Passed'} -> Next: ${nextStepLog}`
  });

  return {
    messages: [logMessage],
    // If Watchdog failed, we enter recovery mode. Otherwise keep current status.
    status: isWatchdogFailed ? "CORTEX_RECOVERY" : state.status
  };
};
