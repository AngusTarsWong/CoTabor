import OpenAI from "openai";
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
你的任务是评估【子 Agent (Sub-Agent)】执行的一系列动作是否真正达成了【上级使命 (Mission)】。

评估标准：
1. **成功 (success)**: 最终页面状态是否符合使命描述？
2. **知识沉淀 (Wisdom)**: 提取任何对未来在此域名或此类任务上有帮助的知识。

输出严格的 JSON：
- "success": boolean — 使命意图是否最终达成？
- "reason": string — 1-2 句解释你的判断逻辑。
- "step_summary": string — 对这一组动作执行后的现状进行事实总结。
- "important_data": object — 提取的任何关键数据（价格、ID、正文摘要等）。
- "site_insight": string | null — 针对该域名的技术心得（例如："搜索框在滚动后才会出现"）。
- "task_wisdom": string | null — 针对此类任务的战略建议。`;

    const userPrompt = `
上级下达的使命 (Mission):
"${action?.intent || action?.description || "未知操作"}"

执行过程总结:
${result?.message || result?.error || "执行完成"}

执行后的页面现状 (Snapshot):
---
${pageContent.substring(0, 5000)}
---

请审计该使命是否达成。仅输出 JSON。`;

    const config = ENV.PLANNER_CONFIG;

    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 800
    } as any, { timeout: 25000 });

    const content = completion.choices[0].message.content;
    let judgment: { 
      success: boolean; 
      reason: string; 
      step_summary: string; 
      important_data?: Record<string, any>;
      site_insight?: string | null;
      task_wisdom?: string | null;
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

    // Update history with summary
    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: stepSummary,
    };

    const returnPayload: Partial<AgentState> = {
      watchdog_output: { status: auditStatus, reason },
      total_history: updatedHistory,
    };

    // 1. Extract Important Data
    if (judgment.important_data && Object.keys(judgment.important_data).length > 0) {
      returnPayload.long_term_memory = {
        summary: state.long_term_memory?.summary || "",
        offset: state.long_term_memory?.offset || 0,
        notebook: { ...(state.long_term_memory?.notebook || {}), ...judgment.important_data },
      };
    }

    // 2. Extract Experience (Triple-Core Memory)
    const currentDomain = new URL(lastStep.meta?.url || 'http://unknown').hostname;
    const insights: any = { site_insights: [], task_wisdom: [] };
    
    if (judgment.site_insight) {
      insights.site_insights.push({ domain: currentDomain, content: judgment.site_insight });
    }
    if (judgment.task_wisdom) {
      insights.task_wisdom.push(judgment.task_wisdom);
    }

    if (insights.site_insights.length > 0 || insights.task_wisdom.length > 0) {
      console.log(`[WatchDog] Distilled new insights:`, insights);
      returnPayload.experience_buffer = insights;
    }

    return returnPayload;
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
