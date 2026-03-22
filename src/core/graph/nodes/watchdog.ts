import { AgentState } from "../state";

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

  if (action.type === "call_skill") {
    // A. 针对高级技能 (Skills - 本地或 MCP)，信任 Executor 结果为主
    if (!result || !result.success) {
      auditStatus = "FAIL";
      reason = result?.error || "Skill execution failed with unknown error";
      console.log(`[WatchDog] Audit FAILED (Skill): ${reason}`);
    } else if (result.skill_result && result.skill_result.status === "FAIL") {
      auditStatus = "FAIL";
      reason = result.skill_result.error || "Skill returned FAIL status";
      console.log(`[WatchDog] Audit FAILED (Skill Data): ${reason}`);
    } else {
      auditStatus = "PASS";
      reason = `Skill ${action.skill_name} executed successfully.`;
      console.log(`[WatchDog] Audit PASSED for skill: ${action.skill_name}`);
    }
  } else {
    // B. 针对底层动作 (CDP Actions)，保留现有的强视觉/DOM校验机制
    if (action.type === "type" && state.scratchpad.length === 0) {
      // 模拟没有 TabId 时的执行失败
      auditStatus = "FAIL";
      reason = "Detected input field is missing or typed text is incorrect";
      console.log(`[WatchDog] Audit FAILED (CDP): ${reason}`);
    } else if (!result || !result.success) {
      auditStatus = "FAIL";
      reason = result?.error || "CDP Action execution failed";
      console.log(`[WatchDog] Audit FAILED (CDP): ${reason}`);
    } else {
      console.log(`[WatchDog] Audit PASSED for CDP action: ${action?.type}`);
    }
  }

  return {
    watchdog_output: {
      status: auditStatus,
      reason: reason,
      one_step: { result: auditStatus }
    }
  };
};
