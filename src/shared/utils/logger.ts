export interface StepLogResult {
  hasImportantInfo: boolean;
  logText: string;
}

/**
 * Format one agent step into a storage-friendly log entry.
 * Returns both the rendered text and whether the step contains notable signal.
 */
export function formatStepLog(step: any): StepLogResult {
  const nodeName = step.node;
  const update = step.update;
  let logText = `\n\n--- [Log] Node: ${nodeName} ---\n`;
  let hasImportantInfo = false;
  
  if (update.llm_payloads && update.llm_payloads.length > 0) {
    const lastPayload = update.llm_payloads[update.llm_payloads.length - 1];
    if (lastPayload.node === nodeName) {
      hasImportantInfo = true;
      logText += `[LLM Request]\nModel: ${lastPayload.payload.model}\nTemperature: ${lastPayload.payload.temperature}\n`;
      const messages = lastPayload.payload.messages;
      messages.forEach((m: any) => {
        let contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (contentStr.length > 3000) {
          contentStr = contentStr.substring(0, 3000) + '\n...[truncated]';
        }
        logText += `> ${m.role}: ${contentStr}\n`;
      });
      logText += `\n[LLM Response]\n${lastPayload.response}\n\n`;
    }
  }

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
