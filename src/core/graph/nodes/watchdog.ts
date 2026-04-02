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
    const systemPrompt = `You are a browser automation watchdog and knowledge distiller. Evaluate whether an action was successfully completed and extract any reusable wisdom for future use.

Output a JSON object with exactly these fields:
- "success": boolean — was the action's intent fulfilled?
- "reason": string — 1-2 sentences explaining your judgment
- "step_summary": string — a concise factual description of what happened
- "important_data": object — any key-value data worth remembering (prices, IDs, etc.). Use {} if none.
- "site_insight": string | null — reusable technical tip for this specific domain (e.g. "Button requires real mouse click", "Information is in a hidden div"). Use null if none.
- "task_wisdom": string | null — strategic advice for this type of task (SOP-level). Use null if none.`;

    const userPrompt = `Action taken:
${actionDesc}

Technical execution result:
${resultDesc}

Current page state after execution:
${pageContent}

Evaluate this step and extract any insights. Output JSON only.`;

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
