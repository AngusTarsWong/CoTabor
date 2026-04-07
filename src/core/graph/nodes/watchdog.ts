import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: WatchDog] ---");

  const { total_history, meta_data } = state;


  if (total_history.length === 0) {
    return { watchdog_output: { status: "PASS", reason: "No history to audit" } };
  }

  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result;
  const pageContent = meta_data?.page_content || "No page content available";

  // Build human-readable action description
  let actionDesc: string;
  if (action?.type === 'call_skill') {
    actionDesc = `call_skill: ${action.skill_name}(${JSON.stringify(action.params)})${action.description ? ` — ${action.description}` : ''}`;
  } else if (action?.type === 'memorize') {
    const memKey = action.key || action.params?.key;
    const memVal = action.value || action.params?.value;
    actionDesc = `memorize: ${memKey} = ${JSON.stringify(memVal)}`;
  } else {
    actionDesc = `${action?.type || 'unknown'}${action?.description ? `: ${action.description}` : ''}`;
  }

  const resultDesc = JSON.stringify(result, null, 2).substring(0, 800);

  try {
    const systemPrompt = `你是一个高级网页自动化审计员（WatchDog）。
你的任务是评估【子 Agent (Sub-Agent)】执行的动作是否真正达成了【当前使命 (Mission)】。

评估标准：
1. **成功 (success)**: 最终页面状态是否符合使命描述？
2. **现状总结 (step_summary)**: 用一句话总结执行动作后的事实结果。

输出严格的 JSON：
- "success": boolean — 使命意图是否达成？
- "reason": string — 1 句简短解释你的判断逻辑。
- "step_summary": string — 对这一组动作执行后的现状进行事实总结 (15字以内)。`;

    const userPrompt = `
当前使命 (Mission):
"${action?.intent || action?.description || "未知操作"}"

执行过程反馈:
${result?.message || result?.error || "执行完成"}

执行后的页面快照 (Snapshot):
---
${pageContent.substring(0, 4000)}
---

请审计。仅输出 JSON。`;

    const config = ENV.PLANNER_CONFIG;

    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 300,
      timeout: 15000,
    });

    const completion = await llm.invoke([
      ["system", systemPrompt],
      ["human", userPrompt]
    ]);

    const content = completion.content as string;
    let judgment: { 
      success: boolean; 
      reason: string; 
      step_summary: string; 
    };
    
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    }
    try {
      judgment = JSON.parse(cleanContent);
    } catch {
      judgment = { success: true, reason: "Parse error", step_summary: actionDesc };
    }

    const auditStatus = judgment.success ? "PASS" : "FAIL";
    const reason = judgment.reason || "Processed";
    const stepSummary = judgment.step_summary || actionDesc;

    console.log(`[WatchDog] Audit ${auditStatus}: ${reason}`);

    // 更新历史记录，写入摘要
    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: stepSummary,
    };

    return {
      watchdog_output: { status: auditStatus, reason },
      total_history: updatedHistory,
    };
  } catch (e) {
    console.error("[WatchDog] LLM call failed, falling back to rule-based audit:", e);

    // Rule-based fallback
    const techSuccess = result?.success !== false && result?.skill_result?.status !== "FAIL";
    const fallbackSummary = techSuccess
      ? `Executed ${actionDesc} — technical result: success`
      : `Executed ${actionDesc} — failed: ${result?.error || result?.skill_result?.error || "unknown error"}`;

    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: fallbackSummary,
    };

    return {
      watchdog_output: {
        status: techSuccess ? "PASS" : "FAIL",
        reason: techSuccess ? "Technical execution succeeded (LLM unavailable)" : (result?.error || "Execution failed"),
      },
      total_history: updatedHistory,
    };
  }
};
