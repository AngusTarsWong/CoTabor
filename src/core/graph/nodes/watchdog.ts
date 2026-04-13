import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { skillRegistry } from "../../../skills/registry";

export const watchdogNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: WatchDog] ---");

  const { total_history, meta_data } = state;

  if (!total_history || total_history.length === 0) {
    return { watchdog_output: { status: "PASS", reason: "No history to audit" } };
  }

  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result || {};
  
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
  } else if (action?.type === 'UI_INTERACT' || (typeof action?.type === 'string' && action.type.startsWith('browser_'))) {
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
    const summary = `${intent} — ${isPass ? '成功' : '未达到预期'}`;

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

  try {
    const systemPrompt = `你是一个高级审计员（WatchDog）。
你的任务是评估【子 Agent (Sub-Agent)】执行的动作是否真正达成了【当前使命 (Mission)】。

评估标准：
1. **成功 (success)**: 结合执行结果或页面状态，判断操作是否成功？

输出严格的 JSON：
- "success": boolean — 使命意图是否达成？
- "reason": string — 1 句简短解释你的判断逻辑。`;

    const userPrompt = `
当前使命 (Mission):
"${intent}"

执行过程反馈:
${result?.message || result?.error || "执行完成"}

相关数据 (Skill Result / Snapshot / Tab Context):
---
${tabContextStr}
页面文本/内容:
${pageContent.substring(0, 3000)}

技能返回数据:
${skillResultDesc}
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
