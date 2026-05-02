import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { getAgentLangInstruction } from "../../../i18n/agent-lang";
import { ENV } from "../../../shared/constants/env";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { AIMessage } from "@langchain/core/messages";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { buildReplannerNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { replannerPrompt, resolveSystem } from "../../../prompts";
import { log } from "../../../shared/utils/log";

export const replannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("\n--- [Node: Replanner] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Replanner] Stop requested. Skipping replan step.");
    return buildStoppedState(state);
  }

  const { request, total_history, scratchpad, long_term_memory, meta_data, last_error_context, task_list, replan_count, retrieved_memories } = state;
  const currentReplanCount = (replan_count ?? 0) + 1;
  log.info(`[Replanner] Invocation #${currentReplanCount}`);

  // Build execution history summary (prefer Watchdog-generated step_summary)
  const historyText = total_history.length > 0
    ? total_history.slice(-10).map(h =>
        h.step_summary
          ? `Step ${h.step}: ${h.step_summary}`
          : `Step ${h.step}: ${h.action?.type}(${h.action?.skill_name || ''}) → ${h.result?.success ? 'SUCCESS' : 'FAILED'}`
      ).join('\n')
    : 'No history available';

  // Build Cortex scratchpad summary
  const cortexText = scratchpad.length > 0
    ? scratchpad.map((s: any, i: number) =>
        `Attempt ${i + 1}: ${s.action?.type || 'unknown'} at (${s.action?.x}, ${s.action?.y}) → ${s.result || 'no result'}`
      ).join('\n')
    : 'No Cortex attempts recorded';

  const pageContent = meta_data?.page_content || 'No page content available';
  const currentUrl = meta_data?.url || 'unknown';
  const retrievedMemoryContext = retrieved_memories?.replannerContext
    ? `\nRetrieved memories:\n${retrieved_memories.replannerContext}\n`
    : "";
  const replannerMemoryUsage = buildReplannerNodeUsage({
    replannerContext: retrieved_memories?.replannerContext,
    l2Rules: retrieved_memories?.l2Rules,
  });

  const langInstruction = await getAgentLangInstruction();
  const promptVars = {
    langInstruction,
    request,
    currentUrl,
    historyText,
    cortexText,
    pageContent,
    retrievedMemoryContext,
    taskListStr: task_list && task_list.length > 0
      ? task_list.map(t => `- [${t.status}] ${t.goal}`).join('\n')
      : 'None',
    lastErrorContext: last_error_context || 'none',
  };
  const systemPrompt = resolveSystem(replannerPrompt, promptVars);
  const userPrompt = replannerPrompt.user(promptVars);

  const config = ENV.PLANNER_CONFIG;

  let rootCause = 'The current UI path is blocked after multiple recovery attempts.';
  let recoveryAction: any = {
    type: 'call_skill',
    skill_name: 'browser_navigate',
    params: { url: currentUrl || 'about:blank' },
    description: 'Reload current page to reset state',
  };
  let newStrategy = 'Reload the current page and attempt the goal using a different approach.';
  let clearHistory = false;
  let parsed: any = {};
  let tokenUsage = { prompt: 0, completion: 0, total: 0 };

  try {
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      maxTokens: 600,
      timeout: 30000,
    });

    const { content, tokenUsage: tu } = await streamLLM(llm, [["system", systemPrompt], ["human", userPrompt]], 'replanner', config.modelName);
    tokenUsage = tu;
    log.info(`[Replanner] LLM output: ${content}`);

    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }
    parsed = JSON.parse(cleanContent);
    rootCause = parsed.root_cause || rootCause;
    recoveryAction = parsed.recovery_action || recoveryAction;
    newStrategy = parsed.new_strategy || newStrategy;
    clearHistory = parsed.clear_history === true;
  } catch (e) {
    log.error('[Replanner] LLM call failed, using fallback recovery:', e);
  }

  // ── Detect "task already complete" from root_cause before calling LLM actions
  const alreadyCompletePatterns = [
    /任务已.*完成/,
    /已.*实际完成/,
    /already.*complet/i,
    /task.*done/i,
    /成功.*完成/,
  ];
  const looksAlreadyComplete = alreadyCompletePatterns.some(p => p.test(rootCause));
  if (looksAlreadyComplete) {
    log.info('[Replanner] Root cause indicates task is already complete — issuing finish action.');
    recoveryAction = { type: 'finish', result: rootCause, description: '任务已完成，直接结束' };
  }

  log.info(`[Replanner] Root cause: ${rootCause}`);
  log.info(`[Replanner] Recovery action: ${JSON.stringify(recoveryAction)}`);
  log.info(`[Replanner] Clear history: ${clearHistory}`);

  const replanContext = `[STRATEGIC REPLAN #${currentReplanCount}]\nRoot cause: ${rootCause}\nNew strategy: ${newStrategy}\nDo NOT repeat the previously failed approach.`;

  const step = total_history.length + 1;
  const recoveryHistoryItem = {
    step,
    action: recoveryAction,
    result: null,
  };

  return {
    planner_output: { action: recoveryAction },
    total_history: [...total_history, recoveryHistoryItem],
    replan_context: replanContext,
    replan_count: currentReplanCount,
    task_list: parsed.task_list || task_list,
    scratchpad: [],
    watchdog_output: null,
    last_error_context: null,
    cortex_retry_count: 0,
    status: "RUNNING",
    ...(clearHistory ? { total_history: [recoveryHistoryItem], long_term_memory: { summary: '', notebook: long_term_memory?.notebook || {}, offset: 0 } } : {}),
    messages: [new AIMessage(`[Replanner #${currentReplanCount}] 原因: ${rootCause} | 恢复行动: ${recoveryAction.description || recoveryAction.result || ''}`)],
    node_memory_usage: replannerMemoryUsage,
    llm_payloads: [{
      node: 'replanner',
      timestamp: Date.now(),
      payload: { model: config.modelName },
      response: parsed,
      model: config.modelName,
      token_usage: tokenUsage
    }],
  };
};
