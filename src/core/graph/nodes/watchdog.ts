import { AgentState } from "../state";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";
import { getPageDriver } from "../../../drivers/page";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: WatchDog] ---");
  
  const { total_history, screenshot, meta_data } = state;
  
  if (total_history.length === 0) {
    return {
      watchdog_output: { status: "PASS", reason: "No history to audit" }
    };
  }

  // 1. 获取最新的一步记录
  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result; // Executor 执行结果
  
  // 2. 抓取动作执行后的最新页面状态 (Perception)
  let updatedMetaData = { ...meta_data };
  const tabId = meta_data?.tabId;
  
  if (tabId && (action.type === "UI_INTERACT" || action.type === "call_skill")) {
    try {
      console.log("[WatchDog] Fetching updated semantic DOM after action execution...");
      // 可以稍微等待一下，确保 DOM 渲染完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const pageDriver = getPageDriver();
      await pageDriver.init(tabId);
      const domText = await pageDriver.getSemanticDOM();
      
      updatedMetaData.page_content = domText;
      console.log(`[WatchDog] Successfully fetched updated DOM. Length: ${domText.length}`);
    } catch (error) {
      console.warn("[WatchDog] Failed to fetch updated DOM:", error);
    }
  }

  // 3. 动态分层审计 (Dynamic Layered Auditing)
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
  } else if (action.type === "UI_INTERACT") {
    if (!result || !result.success) {
      auditStatus = "FAIL";
      reason = result?.error || "UI interaction failed";
      console.log(`[WatchDog] Audit FAILED (UI_INTERACT): ${reason}`);
    } else {
      // 在这里可以接入更复杂的 LLM 视觉/DOM 校验
      console.log(`[WatchDog] Audit PASSED for UI_INTERACT`);
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

  // 4. 设置最终状态，消除 Router 的需要
  // 判断任务是否已由 Planner 声明完成
  const isFinished = state.status === "FINISHED" || action.type === "finish";
  let finalStatus = state.status;
  
  if (isFinished) {
    finalStatus = "FINISHED";
  } else if (auditStatus === "FAIL") {
    finalStatus = "CORTEX_RECOVERY";
  }

  const payload: Partial<AgentState> = {
    watchdog_output: {
      status: auditStatus,
      reason: reason,
      one_step: { result: auditStatus }
    },
    last_error_context: auditStatus === "FAIL" ? reason : null,
    meta_data: updatedMetaData, // 将最新抓取的页面数据传给下一轮的 Planner
    status: finalStatus
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
