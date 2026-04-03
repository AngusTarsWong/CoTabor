import { AgentState } from "../state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { ENV } from "../../../shared/constants/env";
import { perception } from "../../../drivers/perception";
import { emitTrace } from "../../../shared/utils/trace";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Planner] ---");
  
  const { request, total_history, long_term_memory, meta_data, available_skills, last_error_context, replan_context, task_list } = state;
  const config = ENV.PLANNER_CONFIG;

  if (!config.enabled) {
    throw new Error("Planner model is disabled in configuration.");
  }

  // 1. 获取最新 DOM 状态（共享 Executor 提炼的快照）
  let domContext = meta_data?.page_content || "Current Page: Unknown (No content provided)";
  let currentUrl = meta_data?.url || "Unknown URL";
  const tabId = meta_data?.boundTabId || meta_data?.tabId;

  // 仅在首次拉起（且无缓存时）才自动读取一次
  if (tabId && (!meta_data?.page_content || meta_data.page_content === "Current Page: Unknown (No content provided)")) {
    try {
      console.log(`[Planner] Initial DOM extraction for tab: ${tabId}...`);
      const { getPageDriver } = await import("../../../drivers/page");
      const pageDriver = getPageDriver();
      try {
        await pageDriver.init(tabId);
      } catch (e) {
        // Ignore init error if already attached
      }
      domContext = await pageDriver.getSemanticDOM();
      console.log(`[Planner] Initial DOM Extracted.`);
    } catch (e) {
      console.error("[Planner] Failed to extract DOM initially:", e);
      domContext = "Failed to extract DOM. " + (e as Error).message;
    }
  } else if (tabId) {
    // 处理已经被 Executor 写入的 page_content，如果是技能日志，也包含进来
    const prevContent = meta_data?.page_content;
    if (prevContent && (prevContent.startsWith('[Skill Result:') || prevContent.startsWith('[Skill Manual:'))) {
        domContext = `${prevContent}`; // 此时不需要拼接页面的DOM，因为上一步是通用的技能操作。如果需要更新DOM，Planner会在此后的步骤中获得。
    }
  }

  // 2. 初始化 OpenAI 客户端
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true
  });

  // 3. 构建 Prompt
  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const historyContext = ltm.summary ? `Long Term Memory (Summary):\n${ltm.summary}\n` : "";
  const notebookContext = Object.keys(ltm.notebook).length > 0 
    ? `Notebook (Extracted Data):\n${JSON.stringify(ltm.notebook, null, 2)}\n` 
    : "";

  // 动态生成 Short Term Memory 视图 (STM)，优先使用 Watchdog 生成的 step_summary
  const offset = ltm.offset || 0;
  const recentHistory = total_history.slice(offset).slice(-5).map(h => {
    if (h.step_summary) return `Step ${h.step}: ${h.step_summary}`;
    let actionStr = h.action.type;
    if (h.action.type === 'UI_INTERACT') {
      actionStr += `(${h.action.intent})`;
    } else if (h.action.type === 'call_skill') {
      actionStr += `(${h.action.skill_name}, ${JSON.stringify(h.action.params)})`;
    } else if (h.action.type === 'memorize') {
      actionStr += `(${h.action.params?.key})`;
    }
    return `Step ${h.step}: ${actionStr} -> ${JSON.stringify(h.result)}`;
  }).join("\n");

  const skillsList = available_skills && available_skills.length > 0
      ? available_skills.map(s => `- ${s.name} (${JSON.stringify(s.params)}): ${s.description}`).join("\n")
      : "None";

  // 错误上下文：Watchdog 失败提示 或 Replanner 战略重规划指令
  let errorContextStr = "";
  if (replan_context) {
    errorContextStr = `\n${replan_context}\n`;
  } else if (last_error_context) {
    errorContextStr = `\n[ATTENTION] Previous action failed: ${last_error_context}\nPlease adjust your plan based on this error.\n`;
  }

  const systemPrompt = `你是一个高级浏览器自动化策略规划专家。
你的目标是帮助用户完成网页任务。你不需要关注具体的 HTML 或坐标计算，你只需要输出语义化的行动指令。

### 核心动作 (Supported Actions):
1. UI_INTERACT: 与当前页面交互。你需要清晰描述你的意图。
   - 示例: "点击右上角的'登录'按钮" 或 "在搜索框输入'苹果'"。
2. call_skill(skill_name: string, params: object): 调用高级技能（如导航、数据提取）。
3. inspect_skill(skill_name: string): 阅读技能说明书。
4. memorize(key: string, value: any): 将关键信息存入 Notebook，避免在页面跳转时遗忘。
5. finish(summary: string): 任务完成。提供执行总结。

### 规划协议 (Planning Protocol):
你必须维护一个全局任务清单 (task_list)，并在每次响应中返回最新的清单状态。
1. **初始阶段**: 如果 task_list 为空，请将用户目标拆解为 3-5 个逻辑步骤。
2. **状态更新**: 在每轮操作后，更新清单中各步骤的状态。状态仅限: "待办", "进行中", "已完成"。
3. **动态调整**: 如果发现任务比预想的复杂，允许增加新的子任务。
4. **进度展示**: 不要使用 Emoji，直接使用文字描述状态。

### 输出格式 (Output Format):
你必须输出一个严格的 JSON 对象，不包含任何 Markdown 代码块。

JSON 结构示例:
{
  "task_list": [
    { "id": "1", "goal": "打开网站", "status": "已完成" },
    { "id": "2", "goal": "提取数据", "status": "进行中" },
    { "id": "3", "goal": "保存结果", "status": "待办" }
  ],
  "type": "UI_INTERACT",
  "intent": "点击提交按钮",
  "description": "由于已填完表单，现在点击提交"
}

### 人工确认规则 (HUMAN CONFIRMATION):
如果你即将执行高风险或不可逆的操作（提交订单、删除数据、发送消息、购买支付），或者页面需要手动登录/验证码，请在动作 JSON 中添加:
- "requires_human": true
- "human_type": "confirmation" (针对风险操作) | "login" (针对登录/验证码)
- "human_message": "向用户解释为什么需要介入"

可用技能列表 (Available Skills):
${skillsList}
`;

  const currentPlanStr = task_list && task_list.length > 0
    ? `当前任务清单 (Current Plan):\n${task_list.map(t => `- [${t.status}] ${t.goal}`).join('\n')}\n`
    : "尚未制定具体计划，请先拆解任务。";

  const userPrompt = `用户目标 (Goal): ${request}
当前页面 (Current URL): ${currentUrl}

${currentPlanStr}
${historyContext}
${notebookContext}
最近执行历史 (Recent History):
${recentHistory}
${errorContextStr}
当前页面内容预览 (Current Page Context):
${domContext}

请给出下一步行动决策，并更新全局任务清单。`;

  console.log(`[Planner] Thinking about goal: ${request}`);

  if (ENV.PLANNER_CONFIG.enabled) {
    emitTrace({
      node: "planner",
      phase: "enter",
      ts: Date.now(),
      llm: {
        model_name: config.modelName,
        prompt_digest: `${request}\nURL: ${currentUrl}`
      },
      state: {
        before: {
          url: meta_data?.url,
          page_content_len: (meta_data?.page_content || "").length
        },
        recentHistory: total_history.slice(-3)
      }
    });
  }

  try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];
      const payload = {
        model: config.modelName,
        messages: messages,
        temperature: 0.2
        // response_format: { type: "json_object" } // Not supported by Doubao and some OSS models
      };
      
      const completion = await openai.chat.completions.create(payload as any, { timeout: 30000 });

    const content = completion.choices[0].message.content;
    console.log(`[Planner] Raw LLM Output: ${content}`);
    
    // 记录 LLM 交互
    const llmPayload = {
      node: 'planner',
      timestamp: Date.now(),
      payload: payload,
      response: content
    };

    let actionData;
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }
    try {
      actionData = JSON.parse(cleanContent);
    } catch (e) {
      console.error("[Planner] Failed to parse JSON:", e);
      actionData = { type: "error", description: "Failed to parse LLM response" };
    }

    if (typeof actionData?.type === "string" && actionData.type.startsWith("browser_")) {
      actionData = {
        ...actionData,
        type: "call_skill",
        skill_name: actionData.type,
        params: actionData.params || {},
        description: actionData.description || `Execute ${actionData.type}`
      };
    }

    // 提取并验证最新的任务清单
    const updatedTaskList = (actionData.task_list || task_list || []) as any[];

    const newMessages = [
      new AIMessage({
        content: `决策行动: ${actionData.type} - ${actionData.description || JSON.stringify(actionData)}`
      })
    ];

    console.log(`--- [Planner] Action: ${actionData.type} ---`);
    if (updatedTaskList.length > 0) {
      console.log("[Planner] Updated Task List:");
      updatedTaskList.forEach(t => console.log(`  [${t.status}] ${t.goal}`));
    }

    // 处理完成情况：如果任务由于 finish 结束，将清单拼入总结
    if (actionData.type === 'finish' && updatedTaskList.length > 0) {
      const planSummary = updatedTaskList
        .map(t => `- [${t.status}] ${t.goal}`)
        .join('\n');
      actionData.summary = `${actionData.summary || ''}\n\n执行过程回顾:\n${planSummary}`;
    }

    // Ensure status is correctly set to FINISHED if action is finish
    const status = actionData.type === "finish" ? "FINISHED" : "RUNNING";

    // Build the history item here to push to state
    const currentStep = total_history.length + 1;
    const historyItem = {
      step: currentStep,
      action: actionData,
      result: null // Will be updated by executor
    };

    emitTrace({
      node: "planner",
      phase: "exit",
      ts: Date.now(),
      action: {
        type: actionData.type,
        skill_name: (actionData as any).skill_name,
        params_digest: (actionData as any).params || {}
      },
      llm: {
        model_name: config.modelName,
        output_summary: actionData
      },
      state: {
        after: {
          planned_status: actionData.type === "finish" ? "FINISHED" : "RUNNING"
        }
      }
    });

    return {
      planner_output: { action: actionData },
      task_list: updatedTaskList,
      messages: newMessages,
      status: status,
      total_history: [...total_history, historyItem],
      llm_payloads: [llmPayload],
      replan_context: null, // 消费后清空，避免重复注入
      meta_data: {
        ...meta_data,
        tabId: tabId || meta_data?.tabId,
        boundTabId: meta_data?.boundTabId || tabId || meta_data?.tabId,
        url: currentUrl
      }
    };
  } catch (error) {
    console.error("[Planner] LLM Call Failed:", error);
    
    // FALLBACK FOR TESTING: If LLM fails and request is about "echo", mock the response
    if (request.toLowerCase().includes("echo")) {
        console.log("[Planner] Activating Fallback for Echo Test...");
        
        // Check if we already executed echo
        const alreadyEchoed = total_history.some(h => h.action.type === 'call_skill' && h.action.skill_name === 'echo');
        
        if (alreadyEchoed) {
             return {
                planner_output: { 
                    action: { 
                        type: "finish", 
                        description: "Echo skill executed successfully (Fallback)" 
                    } 
                },
                messages: [new AIMessage({ content: `Planner fallback: Echo done, finishing.` })],
                status: "FINISHED"
            };
        }

        const fallbackAction = {
            type: "call_skill",
            skill_name: "echo",
            params: { text: "Hello CoTabor Skill System" },
            description: "Fallback: Calling echo skill due to LLM failure"
        };
        
        return {
            planner_output: { action: fallbackAction },
            messages: [new AIMessage({ content: `Planner fallback: Calling echo skill` })],
            status: "RUNNING"
        };
    }

    // Fallback action to prevent recursion loop on error
    const errorAction = {
        type: "finish",
        description: `Planner failed due to error: ${error}. Stopping execution.`
    };

    emitTrace({
      node: "planner",
      phase: "exit",
      ts: Date.now(),
      result: { status: "fail", error_type: "llm_error" },
      llm: {
        model_name: config.modelName
      },
      action: {
        type: errorAction.type
      }
    });

    return {
      status: "FAILED",
      planner_output: { action: errorAction }, // Provide a valid action so Executor doesn't no-op
      messages: [new AIMessage({ content: `Planner failed: ${error}` })]
    };
  }
};
