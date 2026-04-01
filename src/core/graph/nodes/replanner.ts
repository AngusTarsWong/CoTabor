import OpenAI from "openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { AIMessage } from "@langchain/core/messages";

export const replannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Replanner] ---");

  const { request, total_history, scratchpad, long_term_memory, meta_data, last_error_context, task_list } = state;

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

  const systemPrompt = `You are a strategic recovery planner for a browser automation agent.
The agent has been stuck and failed to make progress after multiple automatic recovery attempts.

Your job:
1. Identify the root cause of the failure
2. Decide a single concrete recovery action to break out of the stuck state
3. Provide strategic guidance for subsequent planning steps

Output a JSON object with exactly these fields:
- "root_cause": string — what fundamentally went wrong (1 sentence)
- "recovery_action": object — one immediate action to execute
- "new_strategy": string — 2-3 sentences of strategic guidance for the next planning cycle
- "task_list": array (optional) — If the current task list is no longer valid, provide a NEW set of tasks.
- "clear_history": boolean — set true only if accumulated history context is misleading and a completely fresh start is needed`;

  const userPrompt = `Original goal: ${request}

Current page: ${currentUrl}

Execution history (last 10 steps):
${historyText}

Cortex visual recovery attempts (all failed):
${cortexText}

Current page state:
${pageContent}

Current task list:
${task_list && task_list.length > 0 ? task_list.map(t => `- [${t.status}] ${t.goal}`).join('\n') : 'None'}

Last known error: ${last_error_context || 'none'}

Analyze the failure and output your recovery plan as JSON.`;

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

  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 600
      // response_format: { type: 'json_object' },
    } as any, { timeout: 30000 });

    const content = completion.choices[0].message.content;
    console.log(`[Replanner] LLM output: ${content}`);

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
    console.error('[Replanner] LLM call failed, using fallback recovery:', e);
  }

  console.log(`[Replanner] Root cause: ${rootCause}`);
  console.log(`[Replanner] Recovery action: ${JSON.stringify(recoveryAction)}`);
  console.log(`[Replanner] Clear history: ${clearHistory}`);

  const replanContext = `[STRATEGIC REPLAN]\nRoot cause: ${rootCause}\nNew strategy: ${newStrategy}\nDo NOT repeat the previously failed approach.`;

  const step = total_history.length + 1;
  const recoveryHistoryItem = {
    step,
    action: recoveryAction,
    result: null,
  };

  return {
    // Replanner acts as Planner: writes planner_output so Executor can run directly
    planner_output: { action: recoveryAction },
    // Append recovery action to history so Watchdog can evaluate it
    total_history: [...total_history, recoveryHistoryItem],
    // Strategic context for the next Planner cycle (after Executor/Watchdog/Memory)
    replan_context: replanContext,
    // Update task list if provided by Replanner, otherwise keep current
    task_list: parsed.task_list || task_list,
    // Clean up error state
    scratchpad: [],
    watchdog_output: null,
    last_error_context: null,
    cortex_retry_count: 0,
    status: recoveryAction.type === 'finish' ? 'FINISHED' : 'RUNNING',
    // Optionally clear history if it's misleading
    ...(clearHistory ? { total_history: [recoveryHistoryItem], long_term_memory: { summary: '', notebook: long_term_memory?.notebook || {}, offset: 0 } } : {}),
    messages: [new AIMessage(`[Replanner] 原因: ${rootCause} | 恢复行动: ${recoveryAction.description}`)],
  };
};
