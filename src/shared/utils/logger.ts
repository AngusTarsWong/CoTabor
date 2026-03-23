export interface StepLogResult {
  hasImportantInfo: boolean;
  logText: string;
}

/**
 * 提取并格式化 Agent 每一步的状态日志，供后续存储（飞书、Console、IndexedDB 等）使用
 * @param step Agent 状态机的 step 数据
 * @returns 格式化后的日志字符串和是否包含重要信息的标记
 */
export function formatStepLog(step: any): StepLogResult {
  const nodeName = step.node;
  const update = step.update;
  let logText = `\n\n--- [Log] Node: ${nodeName} ---\n`;
  let hasImportantInfo = false;
  
  // 如果有 LLM 调用记录，优先记录 LLM 交互详情
  if (update.llm_payloads && update.llm_payloads.length > 0) {
    const lastPayload = update.llm_payloads[update.llm_payloads.length - 1];
    // 只记录当前节点触发的 LLM 负载，防止重复记录
    if (lastPayload.node === nodeName) {
      hasImportantInfo = true;
      logText += `[LLM Request]\nModel: ${lastPayload.payload.model}\nTemperature: ${lastPayload.payload.temperature}\n`;
      const messages = lastPayload.payload.messages;
      messages.forEach((m: any) => {
        let contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        // 截断逻辑：保留足够长的 DOM 上下文，防止太长撑爆存储
        if (contentStr.length > 3000) {
          contentStr = contentStr.substring(0, 3000) + '\n...[truncated]';
        }
        logText += `> ${m.role}: ${contentStr}\n`;
      });
      logText += `\n[LLM Response]\n${lastPayload.response}\n\n`;
    }
  }

  // 记录各个节点的核心输出
  if (nodeName === 'planner' && update.planner_output) {
    hasImportantInfo = true;
    if (update.planner_output.thought && update.planner_output.thought !== "undefined") {
      logText += `Planner Thought: ${update.planner_output.thought}\n`;
    }
    logText += `Planner Action: ${JSON.stringify(update.planner_output.action)}\n`;
  } else if (nodeName === 'watchdog' && update.watchdog_result) {
    hasImportantInfo = true;
    logText += `WatchDog Result: ${JSON.stringify(update.watchdog_result)}\n`;
  } else if (nodeName === 'cortex' && update.cortex_output) {
    hasImportantInfo = true;
    if (update.cortex_output.thought && update.cortex_output.thought !== "undefined") {
      logText += `Cortex Thought: ${update.cortex_output.thought}\n`;
    }
    logText += `Cortex Action: ${JSON.stringify(update.cortex_output.action)}\n`;
  } else if (nodeName === 'replanner' && update.replanner_output) {
    hasImportantInfo = true;
    logText += `Replanner Strategy: ${update.replanner_output.strategy}\n`;
  } else if (nodeName === 'executor') {
    // 提取执行结果和简要历史
    const recentHistory = update.total_history ? update.total_history[update.total_history.length - 1] : null;
    if (recentHistory && recentHistory.result) {
       hasImportantInfo = true;
       logText += `Executor Result: ${JSON.stringify(recentHistory.result)}\n`;
    }
  }

  return {
    hasImportantInfo,
    logText
  };
}
