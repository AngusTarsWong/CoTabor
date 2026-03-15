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
  
  // 2. Mock 验证逻辑 (真实情况需要调用 LLM 对比执行前后的截图)
  // 如果当前步骤执行出错，或者发现异常，将 status 设为 FAIL
  let auditStatus: "PASS" | "FAIL" = "PASS";
  let reason = "Action executed successfully";

  // 为了演示皮层（Cortex）能力，我们模拟在执行 "type" 动作时持续报错
  // 这会触发 Cortex 纠错，如果纠错超过 2 次，就会触发 Replanner 战略重构
  // 这里我们把报错逻辑注释掉，或者只报一次错，以便让流程顺利走到第 4 步触发记忆压缩
  if (action.type === "type" && state.scratchpad.length === 0) {
    auditStatus = "FAIL";
    reason = "Detected input field is missing or typed text is incorrect";
    console.log(`[WatchDog] Audit FAILED: ${reason}`);
  } else {
    console.log(`[WatchDog] Audit PASSED for action: ${action?.type}`);
  }

  return {
    watchdog_output: {
      status: auditStatus,
      reason: reason,
      one_step: { result: auditStatus }
    }
  };
};
