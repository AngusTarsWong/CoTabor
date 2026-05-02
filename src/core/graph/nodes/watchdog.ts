import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { getAgentLangInstruction } from "../../../i18n/agent-lang";
import { ENV } from "../../../shared/constants/env";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { skillRegistry } from "../../../skills/registry";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { watchdogPrompt, resolveSystem } from "../../../prompts";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: WatchDog] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[WatchDog] Stop requested. Skipping audit step.");
    return buildStoppedState(state);
  }

  const { total_history, meta_data } = state;

  if (!total_history || total_history.length === 0) {
    return { watchdog_output: { status: "PASS", reason: "No history to audit" } };
  }

  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result || {};
  const observation = state.last_observation;
  
  const intent = action?.intent || action?.description || "未知操作";

  // 1. 基础防线 (Technical Check)
  if (result.success === false || result.status === "FAIL" || result.skill_result?.status === "FAIL") {
    const errorMsg = result.error || result.skill_result?.error || "执行报错，技术级失败";
    console.log(`[WatchDog] Technical Fail: ${errorMsg}`);
    
    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: `执行失败: ${errorMsg}`,
    };
    
    return {
      watchdog_output: { status: "FAIL", reason: errorMsg },
      last_error_context: `Skill execution failed: ${errorMsg}`,
      total_history: updatedHistory
    };
  }

  // 2. 路由分发 (Audit Dispatch)
  let strategy = 'rule_based'; // 默认走规则
  let validator: ((res: any) => boolean) | undefined;

  if (action?.type === 'call_skill' && action.skill_name) {
    const auditConfig = skillRegistry.getAuditConfig(action.skill_name);
    if (auditConfig) {
      strategy = auditConfig.strategy;
      validator = auditConfig.validator;
    }
  } else if (action?.type === 'ui_interact' || (typeof action?.type === 'string' && action.type.startsWith('browser_'))) {
    // 遗留的网页交互操作强制走 LLM 语义审计
    strategy = 'llm_semantic';
  }

  // 3. 执行审计 (Execute Audit)
  if (strategy === 'rule_based') {
    console.log(`[WatchDog] Using Fast Track (rule_based) for ${action?.skill_name || action?.type}`);
    
    let isPass = true;
    if (validator) {
      try {
        isPass = validator(result);
      } catch (e) {
        console.error("[WatchDog] Validator thrown error:", e);
        isPass = false;
      }
    } else {
      // 默认规则检查：只要 success 不是 false 就算过（前面已经检查过，所以必过）
      isPass = true; 
    }

    const auditStatus = isPass ? "PASS" : "FAIL";
    const reason = isPass ? "规则校验通过" : "业务级规则校验未通过";
    const observationDigest = observation?.text
      ? ` | 结果摘要: ${String(observation.text).replace(/\s+/g, " ").slice(0, 220)}`
      : "";
    const summary = `${intent} — ${isPass ? '成功' : '未达到预期'}${observationDigest}`;

    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: summary,
    };

    return {
      watchdog_output: { status: auditStatus, reason },
      total_history: updatedHistory
    };
  }

  // strategy === 'llm_semantic' (慢通道)
  console.log(`[WatchDog] Using Slow Track (llm_semantic) for ${action?.skill_name || action?.type}`);
  
  const pageContent = meta_data?.page_content || "";
  const skillResultDesc = result.skill_result ? JSON.stringify(result.skill_result, null, 2).substring(0, 1000) : "无数据";
  
  // 注入多标签页上下文
  const openedTabsInfo = (state.opened_tabs || []).map(t => 
    `[TabId: ${t.tabId}] ${t.title} (${t.url}) ${t.tabId === state.active_tab_id ? "<- ACTIVE" : ""}`
  ).join("\n");
  const tabContextStr = state.opened_tabs && state.opened_tabs.length > 0
    ? `\n浏览器多标签页状态:\n当前激活的 TabId: ${state.active_tab_id || "未知"}\n已打开的标签页:\n${openedTabsInfo}\n`
    : "";

  const langInstruction = await getAgentLangInstruction();
  try {
    const promptVars = {
      langInstruction,
      intent,
      executionFeedback: result?.message || result?.error || "执行完成",
      tabContextStr,
      pageContent,
      skillResultDesc,
    };
    const systemPrompt = resolveSystem(watchdogPrompt, promptVars);
    const userPrompt = watchdogPrompt.user(promptVars);

    const config = ENV.PLANNER_CONFIG;
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 300,
      timeout: 15000,
    });

    const { content, tokenUsage } = await streamLLM(llm, [["system", systemPrompt], ["human", userPrompt]], 'watchdog', config.modelName);
    let judgment: { success: boolean; reason: string; };
    
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('\`\`\`json')) {
      cleanContent = cleanContent.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    }
    try {
      judgment = JSON.parse(cleanContent);
    } catch {
      judgment = { success: true, reason: "Parse error, assuming success" };
    }

    const auditStatus = judgment.success ? "PASS" : "FAIL";
    const reason = judgment.reason || "Processed";
    const stepSummary = `${intent} — ${judgment.success ? '成功' : '未达到预期'}`;

    console.log(`[WatchDog] Audit ${auditStatus}: ${reason}`);

    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: stepSummary,
    };

    return {
      watchdog_output: { status: auditStatus, reason },
      total_history: updatedHistory,
      llm_payloads: [{
        node: 'watchdog',
        timestamp: Date.now(),
        payload: { model: config.modelName },
        response: content,
        model: config.modelName,
        token_usage: tokenUsage
      }]
    };
  } catch (e) {
    console.error("[WatchDog] LLM call failed, conservative FAIL to prevent silent pass-through:", e);

    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: `Executed ${intent} — LLM unavailable`,
    };

    return {
      watchdog_output: {
        status: "FAIL",
        reason: "Slow audit LLM unavailable, conservative fail to prevent silent pass-through.",
      },
      total_history: updatedHistory,
    };
  }
};
