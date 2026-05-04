import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { getAgentLangInstruction } from "../../../i18n/agent-lang";
import { ENV } from "../../../shared/constants/env";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { skillRegistry } from "../../../skills/registry";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { watchdogPrompt, resolveSystem } from "../../../prompts";
import { log } from "../../../shared/utils/log";
import type { ExecutionResult } from "../../types/history";
import { getLlmClientHeaders } from "../../../shared/utils/llm-headers";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("--- [Node: WatchDog] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[WatchDog] Stop requested. Skipping audit step.");
    return buildStoppedState(state);
  }

  const { total_history, meta_data, screenshot } = state;

  if (!total_history || total_history.length === 0) {
    return { watchdog_output: { status: "PASS", reason: "No history to audit" } };
  }

  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = (lastStep.result ?? {}) as ExecutionResult;
  const skillResult = (result.skill_result ?? null) as Record<string, any> | null;
  const observation = state.last_observation;
  
  const intent = action?.intent || action?.description || "未知操作";

  // 1. Fast technical failure check.
  if (result.success === false || skillResult?.status === "FAIL") {
    const errorMsg = result.error || result.reason || skillResult?.error || "执行报错，技术级失败";
    log.info(`[WatchDog] Technical Fail: ${errorMsg}`);
    
    const updatedHistory = [...total_history];
    updatedHistory[updatedHistory.length - 1] = {
      ...updatedHistory[updatedHistory.length - 1],
      step_summary: `执行失败: ${errorMsg}`,
    };
    
    return {
      watchdog_output: { status: "FAIL", reason: errorMsg },
      last_error_context: `Skill execution failed: ${errorMsg}`,
      total_history: updatedHistory,
      debug_payloads: [
        {
          node: "watchdog",
          title: "技术失败审查",
          input: {
            intent,
            action,
            result,
            observation,
          },
          output: {
            errorMsg,
          },
          media: screenshot
            ? [{ title: "失败审查截图", mimeType: "image/jpeg", data: screenshot }]
            : [],
        },
      ],
    };
  }

  // 2. Choose the audit strategy.
  let strategy = 'rule_based';
  let validator: ((res: any) => boolean) | undefined;

  if (action?.type === 'call_skill' && action.skill_name) {
    const auditConfig = skillRegistry.getAuditConfig(action.skill_name);
    if (auditConfig) {
      strategy = auditConfig.strategy;
      validator = auditConfig.validator;
    }
  } else if (action?.type === 'ui_interact' || (typeof action?.type === 'string' && action.type.startsWith('browser_'))) {
    // Legacy UI/browser actions always use semantic LLM auditing.
    strategy = 'llm_semantic';
  }

  // 3. Execute the selected audit path.
  if (strategy === 'rule_based') {
    log.info(`[WatchDog] Using Fast Track (rule_based) for ${action?.skill_name || action?.type}`);
    
    let isPass = true;
    if (validator) {
      try {
        isPass = validator(result);
      } catch (e) {
        log.error("[WatchDog] Validator thrown error:", e);
        isPass = false;
      }
    } else {
      // Without a custom validator, the technical check above is sufficient.
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
      total_history: updatedHistory,
      debug_payloads: [
        {
          node: "watchdog",
          title: "规则审查输入",
          input: {
            intent,
            action,
            result,
            observation,
          },
          media: screenshot
            ? [{ title: "审查时页面截图", mimeType: "image/jpeg", data: screenshot }]
            : [],
        },
      ],
    };
  }

  // Slow path: semantic LLM audit.
  log.info(`[WatchDog] Using Slow Track (llm_semantic) for ${action?.skill_name || action?.type}`);
  
  const pageContent = meta_data?.page_content || "";
  const skillResultDesc = skillResult ? JSON.stringify(skillResult, null, 2).substring(0, 1000) : "无数据";
  
  // Include multi-tab context for audit reasoning.
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
      executionFeedback: result.message || result.error || result.reason || "执行完成",
      tabContextStr,
      pageContent,
      skillResultDesc,
    };
    const systemPrompt = resolveSystem(watchdogPrompt, promptVars);
    const userPrompt = watchdogPrompt.user(promptVars);

    const config = ENV.PLANNER_CONFIG;
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { 
        baseURL: config.baseUrl,
        defaultHeaders: getLlmClientHeaders()
      },
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 300,
      timeout: 15000,
    });

    const llmMessages = [["system", systemPrompt], ["human", userPrompt]];
    const { content, tokenUsage } = await streamLLM(llm, llmMessages, 'watchdog', config.modelName);
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

    log.info(`[WatchDog] Audit ${auditStatus}: ${reason}`);

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
        payload: {
          model: config.modelName,
          systemPrompt,
          userPrompt,
          messages: llmMessages,
          input: {
            intent,
            executionFeedback: result.message || result.error || result.reason || "执行完成",
            pageContent,
            skillResultDesc,
            tabContextStr,
          },
        },
        response: content,
        model: config.modelName,
        token_usage: tokenUsage
      }],
      debug_payloads: [
        {
          node: "watchdog",
          title: "语义审查上下文",
          input: {
            intent,
            executionFeedback: result.message || result.error || result.reason || "执行完成",
            tabContextStr,
            skillResultDesc,
          },
          output: {
            auditStatus,
            reason,
          },
          media: screenshot
            ? [{ title: "审查时页面截图", mimeType: "image/jpeg", data: screenshot }]
            : [],
        },
      ],
    };
  } catch (e) {
    log.error("[WatchDog] LLM call failed, conservative FAIL to prevent silent pass-through:", e);

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
      debug_payloads: [
        {
          node: "watchdog",
          title: "语义审查失败",
          input: {
            intent,
            executionFeedback: result.message || result.error || result.reason || "执行完成",
            pageContent,
            skillResultDesc,
          },
          output: {
            reason: "Slow audit LLM unavailable, conservative fail to prevent silent pass-through.",
          },
          media: screenshot
            ? [{ title: "语义审查截图", mimeType: "image/jpeg", data: screenshot }]
            : [],
        },
      ],
    };
  }
};
