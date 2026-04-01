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

  const systemPrompt = `You are a browser automation watchdog. Evaluate whether an action was successfully completed based on the action taken, its technical execution result, and the current page state after execution.

Output a JSON object with exactly these fields:
- "success": boolean — was the action's intent fulfilled?
- "reason": string — 1-2 sentences explaining your judgment
- "step_summary": string — a concise factual description of what happened: what was done, what was found or changed on the page, any key data observed
- "important_data": object — any key-value data worth remembering for future steps (prices, order numbers, IDs, names, URLs, dates). Use {} if nothing notable.`;

  const userPrompt = `Action taken:
${actionDesc}

Technical execution result:
${resultDesc}

Current page state after execution:
${pageContent}

Evaluate whether this action was successfully completed. Output JSON only.`;

  const config = ENV.PLANNER_CONFIG;

  try {
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
      max_tokens: 600
      // response_format: { type: "json_object" },
    } as any, { timeout: 25000 });

    const content = completion.choices[0].message.content;
    console.log(`[WatchDog] LLM judgment: ${content}`);

    let judgment: { success: boolean; reason: string; step_summary: string; important_data?: Record<string, any> };
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }
    try {
      judgment = JSON.parse(cleanContent);
    } catch {
      judgment = { success: true, reason: "Failed to parse watchdog response", step_summary: actionDesc };
    }

    const auditStatus = judgment.success ? "PASS" : "FAIL";
    const reason = judgment.reason || (judgment.success ? "Action succeeded" : "Action failed");
    const stepSummary = judgment.step_summary || actionDesc;

    console.log(`[WatchDog] Audit ${auditStatus}: ${reason}`);

    if (ENV.DEBUG_MODE) {
      emitTrace({
        node: "watchdog",
        phase: "exit",
        ts: Date.now(),
        result: { status: auditStatus === "PASS" ? "success" : "fail" },
        route: { watchdog_verdict: auditStatus === "PASS" ? "pass" : "fail", route_reason: reason }
      });
    }

    // Write step_summary back into the last history item for Memory to consume
    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: stepSummary,
    };

    const returnPayload: Partial<typeof state> = {
      watchdog_output: { status: auditStatus, reason },
      total_history: updatedHistory,
    };

    // 自动将 LLM 提取的重要数据写入 notebook
    const importantData = judgment.important_data;
    if (importantData && Object.keys(importantData).length > 0) {
      console.log(`[WatchDog] Auto-extracting data to notebook:`, importantData);
      returnPayload.long_term_memory = {
        summary: state.long_term_memory?.summary || "",
        offset: state.long_term_memory?.offset || 0,
        notebook: {
          ...(state.long_term_memory?.notebook || {}),
          ...importantData,
        },
      };
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
