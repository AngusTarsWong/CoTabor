import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { AIMessage } from "@langchain/core/messages";

export const replannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Replanner] ---");

  const { request, total_history, scratchpad, long_term_memory, meta_data, last_error_context, task_list, replan_count } = state;
  const currentReplanCount = (replan_count ?? 0) + 1;
  console.log(`[Replanner] Invocation #${currentReplanCount}`);

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

  const systemPrompt = `你是一个战略级网页操作重规划专家（Replanner）。
当 Agent 在执行中遇到死循环、审计失败或视觉识别偏差时，你负责提供单步【恢复使命 (Recovery Mission)】以打破僵局。

你的职责：
1. **分析根因**：指出系统为什么卡住了（例如：审计过于严格、页面没有正确跳转等）。
2. **制定恢复动作**：给出下一步要执行的宏观使命，而非底层微操。
3. **输出**：必须是严格的 JSON。

⚠️ 特别重要：如果你判断原始任务【已经实际完成】，请直接使用 type="finish" 而不是继续执行！
   - 不要调用 return_task_result / finish_task 等不存在的技能名称。
   - 不要凭空生成虚假的恢复动作。

输出字段定义：
- "root_cause": string — 故障根因分析（1句话）。
- "recovery_action": object — 即将执行的恢复动作对象，必须包含：
    - "type": string — 可选值：
        * "finish" — 当你判断任务已完成时，使用此选项来结束整个任务。
        * "UI_INTERACT" — 针对网页操作。
        * "call_skill" — 针对导航/飞书等真实存在的技能。
    - "result": string — (仅 finish 需要) 对用户的最终结果描述。
    - "intent": string — (仅 UI_INTERACT 需要) 战术使命描述。
    - "skill_name": string — (仅 call_skill 需要) 技能名称（必须是已知存在的技能）。
    - "params": object — (仅 call_skill 需要) 技能参数。
    - "description": string — 为什么要执行这个恢复动作。
- "new_strategy": string — 给后续 Planner 的战略建议。
- "task_list": array (optional) — 如果任务列表已失效，请输出全新的任务列表。
- "clear_history": boolean — 只有当历史记录逻辑极其混乱时才设置为 true。`;

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
    console.log('[Replanner] Root cause indicates task is already complete — issuing finish action.');
    recoveryAction = { type: 'finish', result: rootCause, description: '任务已完成，直接结束' };
  }

  console.log(`[Replanner] Root cause: ${rootCause}`);
  console.log(`[Replanner] Recovery action: ${JSON.stringify(recoveryAction)}`);
  console.log(`[Replanner] Clear history: ${clearHistory}`);

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
    status: (recoveryAction.type === 'finish') ? 'FINISHED' : 'RUNNING',
    ...(clearHistory ? { total_history: [recoveryHistoryItem], long_term_memory: { summary: '', notebook: long_term_memory?.notebook || {}, offset: 0 } } : {}),
    messages: [new AIMessage(`[Replanner #${currentReplanCount}] 原因: ${rootCause} | 恢复行动: ${recoveryAction.description || recoveryAction.result || ''}`)],
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
