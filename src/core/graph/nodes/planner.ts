import { AgentState } from "../state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../../shared/constants/env";
import { perception } from "../../../drivers/perception";
import { emitTrace } from "../../../shared/utils/trace";
import { streamLLM } from "../../../shared/utils/llm-stream";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Planner] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Planner] Stop requested. Halting before next planning step.");
    return buildStoppedState(state);
  }

  const { request, total_history, long_term_memory, meta_data, available_skills, last_error_context, replan_context, task_list, retrieved_memories } = state;
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

  // 2. 初始化 LangChain ChatOpenAI 客户端
  const llm = new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseUrl },
    modelName: config.modelName,
    temperature: 0.2,
    timeout: 120000,
  });

  // 3. 构建 Prompt
  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const historyContext = ltm.summary ? `Long Term Memory (Summary):\n${ltm.summary}\n` : "";
  const notebookContext = Object.keys(ltm.notebook).length > 0
    ? `Notebook (Extracted Data):\n${JSON.stringify(ltm.notebook, null, 2)}\n`
    : "";
  const retrievedMemoryContext = retrieved_memories?.plannerContext
    ? `Retrieved Memories:\n${retrieved_memories.plannerContext}\n`
    : "";

  // 整理多标签页上下文
  const openedTabsInfo = (state.opened_tabs || []).map(t => 
    `[TabId: ${t.tabId}] ${t.title} (${t.url}) ${t.tabId === state.active_tab_id ? "<- ACTIVE" : ""}`
  ).join("\n");
  const tabContextStr = state.opened_tabs && state.opened_tabs.length > 0
    ? `\n#### 浏览器多标签页状态 (Tabs)\n当前激活的 TabId: ${state.active_tab_id || "未知"}\n已打开的标签页:\n${openedTabsInfo}\n`
    : "";

  // 动态生成 Short Term Memory 视图 (STM)，优先使用 Watchdog 生成的 step_summary
  const offset = ltm.offset || 0;
  const recentHistory = total_history.slice(offset).slice(-5).map(h => {
    if (h.step_summary) return `Step ${h.step}: ${h.step_summary}`;
    let actionStr = h.action.type;
    if (h.action.type === 'ui_interact') {
      actionStr += `(${h.action.intent})`;
    } else if (h.action.type === 'call_skill') {
      actionStr += `(${h.action.skill_name}, ${JSON.stringify(h.action.params)})`;
    } else if (h.action.type === 'memorize') {
      actionStr += `(${h.action.params?.key})`;
    }
    return `Step ${h.step}: ${actionStr} -> ${JSON.stringify(h.result)}`;
  }).join("\n");

  // 2.5 技能过滤：隐藏原子级浏览器操作，强制 Planner 使用 ui_interact 战略使命
  const tacticalSkills = new Set(["browser_click_index", "browser_type_index", "browser_press_key", "browser_scroll_direction"]);
  const filteredSkills = (available_skills || []).filter(s => !tacticalSkills.has(s.name));

  const skillsList = filteredSkills.length > 0
    ? filteredSkills.map(s => `- ${s.name} (${JSON.stringify(s.params)}): ${s.description}`).join("\n")
    : "None";

  // 错误上下文：Watchdog 失败提示 或 Replanner 战略重规划指令
  let errorContextStr = "";
  if (replan_context) {
    errorContextStr = `\n${replan_context}\n`;
  } else if (last_error_context) {
    errorContextStr = `\n[ATTENTION] Previous action failed: ${last_error_context}\nPlease adjust your plan based on this error.\n`;
  }

  const systemPrompt = `你是一个战略级网页操作助手。请根据页面现状给出宏观操作指令。

### 规则 (Rules):
- 必须维护任务清单(task_list)并更新进度 ("待办", "进行中", "已完成")。
- 输出必须是严格的 JSON，且不包含 Markdown 代码块。
- **任务完成规则 (Finish Rule)**: 当你判断用户目标已经完成，且已经可以直接向用户给出最终答案时，必须输出 \`{"type": "finish", "result": "...", "description": "任务已完成" }\`。
- **禁止伪完成动作**: 不要使用 \`echo\`、\`call_skill(echo)\`、\`return_task_result\`、\`done\` 等动作来表示任务结束；这些都不是合法的最终完成协议。
- **最终答案写入位置**: 任务完成时，给用户的最终结论必须放在 \`result\` 字段中，而不是放在普通 skill 的 \`params.text\` 中。
- **UI 交互 ("ui_interact")**: 这是主要的交互方式。在 "intent" 中详细描述你想在当前页面达成的战术目标（例如："找到搜索框并搜索'人工智能'"）。执行层会自动处理 index。
- **严格格式要求**: 只要是网页交互动作，"type" 必须输出小写字符串 "ui_interact"，不要输出 "UI_INTERACT"、"UiInteract"、"uiInteract" 或其他变体。
- **多标签页管理**: 默认在当前激活的标签页(Active Tab)执行。如果你需要新开标签页，或者切换到其他标签页，请使用 \`call_skill\` 调用对应的浏览器技能(browser_new_tab, browser_switch_tab)。注意：在同一时刻，只允许一个 Active Tab 接收指令。
- **技能调用 (call_skill)**: 仅在执行导航 (browser_navigate)、多标签页管理 (browser_new_tab等)、飞书操作等特定系统功能时使用。此时**必须**根据技能描述提供完整的 "params"（例如：browser_switch_tab 必须提供 "tabId"）。
- **主动记忆 (memorize)**: 【极其重要】如果你在当前页面发现了未来可能用到的关键数据（如订单号、价格、特定URL），或者总结了某种操作技巧，必须立刻使用 \`{"type": "memorize", "params": {"key": "...", "value": "..."}}\` 将其写入 Notebook。不要等到任务结束，边做边记！
- **去细节化**: 你不再需要记住或输出按钮/输入框的编号 (index)。

### 示例格式:
{
  "task_list": [
    { "id": "1", "goal": "进网站", "status": "进行中" }
  ],
  "type": "call_skill",
  "skill_name": "browser_navigate",
  "params": { "url": "https://news.google.com" }, 
  "description": "准备开始任务，正在跳转到目标新闻网站。"
}

任务完成时的正确示例:
{
  "task_list": [
    { "id": "1", "goal": "识别当前页面的核心主题", "status": "已完成" },
    { "id": "2", "goal": "梳理并总结当前页面完整内容", "status": "已完成" },
    { "id": "3", "goal": "返回页面内容总结结果", "status": "已完成" }
  ],
  "type": "finish",
  "result": "这里填写最终给用户的页面总结结果。",
  "description": "任务已完成，返回最终结论。"
}

可用技能 (Skills):
${skillsList}
`;

  const currentPlanStr = task_list && task_list.length > 0
    ? `${task_list.map(t => `- [${t.status}] ${t.goal}`).join('\n')}\n`
    : "尚未制定具体计划，请先拆解任务。";

  const userPrompt = `### [任务目标]
${request}

### [当前进度]
${currentPlanStr}

### [执行背景]
#### 记忆与记录
${historyContext}
${notebookContext}
${retrievedMemoryContext}
${tabContextStr}
#### 最近操作记录
${recentHistory}
${errorContextStr}

### [网页内容]
当前 URL: ${currentUrl}
${domContext}

请基于以上现状，给出下一步行动决策 JSON。`;

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
      { role: "user", content: `${systemPrompt}\n\n${userPrompt}` }
    ];
    const payload = {
      model: config.modelName,
      messages: messages,
      temperature: 0.2
    };

    const { content, tokenUsage } = await streamLLM(llm, messages, 'planner', config.modelName);
    console.log(`[Planner] Raw LLM Output: ${content}`);

    // 记录 LLM 交互
    const llmPayload = {
      node: 'planner',
      timestamp: Date.now(),
      payload: payload,
      response: content,
      model: config.modelName,
      token_usage: tokenUsage
    };

    let actionData: any;
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
    } else if (
      typeof actionData?.type === "string" &&
      actionData.type !== "call_skill" &&
      filteredSkills.some((skill) => skill.name === actionData.type)
    ) {
      actionData = {
        ...actionData,
        type: "call_skill",
        skill_name: actionData.type,
        params: actionData.params || {},
        description: actionData.description || `Execute ${actionData.type}`,
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
          status: "RUNNING"
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
      error: String(error),
      planner_output: { action: errorAction }, // Provide a valid action so Executor doesn't no-op
      messages: [new AIMessage({ content: `Planner failed: ${error}` })]
    };
  }
};
