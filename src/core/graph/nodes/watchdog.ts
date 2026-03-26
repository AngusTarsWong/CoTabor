import { AgentState } from "../state";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: WatchDog] ---");
  
  const { total_history, screenshot } = state;
  
  if (total_history.length === 0) {
    return {
      watchdog_output: { status: "PASS", reason: "No history to audit" }
    };
  }

  // 1. 获取最新的一步记录
  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result; // Executor 执行结果
  
  // 2. 动态分层审计 (Dynamic Layered Auditing)
  let auditStatus: "PASS" | "FAIL" = "PASS";
  let reason = "Action executed successfully";
  const skillStatus = String(result?.skill_result?.status || "").toUpperCase();
  const hasSkillErrorMessage = Boolean(
    result?.skill_result?.error ||
    result?.skill_result?.message?.toLowerCase?.().includes("error") ||
    result?.skill_result?.message?.toLowerCase?.().includes("failed")
  );
  const hasRuntimeError = Boolean(result?.error);

  if (action.type === "call_skill") {
    if (!result || !result.success || hasRuntimeError) {
      auditStatus = "FAIL";
      reason = result?.error || "Skill execution failed with unknown error";
      console.log(`[WatchDog] Audit FAILED (Skill): ${reason}`);
    } else if (
      skillStatus === "FAIL" ||
      skillStatus === "FAILED" ||
      skillStatus === "ERROR" ||
      hasSkillErrorMessage
    ) {
      auditStatus = "FAIL";
      reason = result.skill_result?.error || result.skill_result?.message || "Skill returned failure status";
      console.log(`[WatchDog] Audit FAILED (Skill Data): ${reason}`);
    } else {
      auditStatus = "PASS";
      reason = `Skill ${action.skill_name} executed successfully.`;
      console.log(`[WatchDog] Audit PASSED for skill: ${action.skill_name}`);
    }
  } else {
    // Other actions like finish or inspect_skill
    if (!result || !result.success) {
      auditStatus = "FAIL";
      reason = result?.error || "Action execution failed";
      console.log(`[WatchDog] Audit FAILED (Action): ${reason}`);
    } else {
      console.log(`[WatchDog] Audit PASSED for action: ${action?.type}`);
    }
  }

  const payload: Partial<AgentState> = {
    watchdog_output: {
      status: auditStatus,
      reason: reason,
      one_step: { result: auditStatus }
    },
    last_error_context: auditStatus === "FAIL" ? reason : null
  };
  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "watchdog",
      phase: "exit",
      ts: Date.now(),
      result: { status: auditStatus === "PASS" ? "success" : "fail" },
      route: {
        watchdog_verdict: auditStatus === "PASS" ? "pass" : "fail",
        route_reason: reason
      }
    });
  }
  return payload;
};
