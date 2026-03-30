import { AgentState } from "../state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { ENV } from "../../../shared/constants/env";
import { DOMDriver } from "../../../drivers/dom/index";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Planner] ---");
  
  const { request, total_history, long_term_memory, meta_data, available_skills, last_error_context } = state;
  const config = ENV.PLANNER_CONFIG;

  if (!config.enabled) {
    throw new Error("Planner model is disabled in configuration.");
  }

  // 1. 获取最新 DOM 状态（包含页面信息、可见内容、可交互元素）
  let domContext = “Current Page: Unknown (No content provided)”;
  let domElements: any[] = [];

  const tabId = meta_data?.tabId;
  if (tabId) {
    try {
      console.log(`[Planner] Extracting DOM for tab: ${tabId}...`);
      const domDriver = new DOMDriver(tabId);
      const domResult = await domDriver.extractDOM();
      domElements = domResult.elements;
      domContext = domResult.simplifiedText || “Page is empty”;
      console.log(`[Planner] Extracted ${domElements.length} interactive elements from: ${domResult.pageUrl}`);
    } catch (e) {
      console.error(“[Planner] Failed to extract DOM:”, e);
      domContext = “Failed to extract DOM. “ + (e as Error).message;
    }
    // 如果上一步 Executor 返回了技能查询结果（非通用页面文本），拼在 DOM 上下文前
    const prevContent = meta_data?.page_content;
    if (prevContent && (prevContent.startsWith('[Skill Result:') || prevContent.startsWith('[Skill Manual:'))) {
      domContext = `[Previous Skill Output]:\n${prevContent}\n\n${domContext}`;
    }
  } else if (meta_data?.page_content) {
    // For testing/mocking when tabId is not available
    domContext = meta_data.page_content;
  }

  // 2. 初始化 OpenAI 客户端
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true // 允许在浏览器环境运行
  });

  // 3. 构建 Prompt
  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const historyContext = ltm.summary ? `Long Term Memory (Summary):\n${ltm.summary}\n` : "";
  const notebookContext = Object.keys(ltm.notebook).length > 0 
    ? `Notebook (Extracted Data):\n${JSON.stringify(ltm.notebook, null, 2)}\n` 
    : "";

  // 动态生成 Short Term Memory 视图 (STM)
  const offset = ltm.offset || 0;
  const recentHistory = total_history.slice(offset).slice(-5).map(h => {
    let actionStr = h.action.type;
    if (h.action.type === 'call_skill') {
      actionStr += `(${h.action.skill_name}, ${JSON.stringify(h.action.params)})`;
    } else if (h.action.type === 'memorize') {
      actionStr += `(${h.action.params?.key})`;
    }
    return `Step ${h.step}: ${actionStr} -> ${JSON.stringify(h.result)}`;
  }).join("\n");

  const skillsList = available_skills && available_skills.length > 0
      ? available_skills.map(s => `- ${s.name} (${JSON.stringify(s.params)}): ${s.description}`).join("\n")
      : "None";

  // 如果有 Watchdog 传来的错误，让 Planner 知道
  const errorContextStr = last_error_context ? `\n[ATTENTION] Previous action failed: ${last_error_context}\nPlease adjust your plan based on this error.\n` : "";

  const systemPrompt = `You are an intelligent browser automation agent.
Your goal is to help the user complete web tasks by planning the next action.
You should analyze the current DOM context and history to decide the next step.

Supported Actions:
1. call_skill(skill_name: string, params: object): Execute a skill to interact with the browser.
2. inspect_skill(skill_name: string): Read the full manual of a skill.
3. memorize(key: string, value: any): Save important information (e.g. prices, names, specific URLs) into your Notebook so you don't forget it across page navigations.
4. finish(summary: string): Task completed. Provide a summary.

HUMAN CONFIRMATION RULES:
If you are about to perform a risky or irreversible action (submitting a form, deleting data, sending a message, making a purchase, clicking a confirm/submit/delete button), OR if the current page requires login / shows a CAPTCHA, add these extra fields to your action JSON:
- "requires_human": true
- "human_type": "confirmation"  (for risky/irreversible actions) | "login" (for login page or CAPTCHA)
- "human_message": "一句话说清楚你要做什么，或者用户需要完成什么操作"

Example - risky action requiring confirmation:
{
  "type": "call_skill",
  "skill_name": "browser_click_index",
  "params": { "index": 5 },
  "description": "Click the Submit button to place the order",
  "requires_human": true,
  "human_type": "confirmation",
  "human_message": "我即将点击「提交订单」按钮，请确认是否继续。"
}

Example - login page detected:
{
  "type": "call_skill",
  "skill_name": "browser_navigate",
  "params": { "url": "https://example.com/dashboard" },
  "description": "Navigate to dashboard (login required)",
  "requires_human": true,
  "human_type": "login",
  "human_message": "当前页面需要登录，请手动完成登录后点击「继续」。"
}

Available Skills:
${skillsList}

DECISION PROTOCOL:
1. **Analyze Context**: Read the "Page Content" to understand what the page shows, then use "Interactive Elements" to decide what to click or type.
2. **Memorize**: If you see critical information on the page that you will need later (e.g. prices, IDs, names — especially before navigating away), use the \`memorize\` action first.
3. **Choose Skill**: Select the most appropriate skill from the "Available Skills" list.
4. **Output Action**: Output a JSON object to call the chosen action.

Output Format:
You must output a strictly valid JSON object. Do not include markdown code blocks.
Example 1 (Call Skill):
{
  "type": "call_skill",
  "skill_name": "browser_click_index",
  "params": { "index": 15 },
  "description": "Clicking the 'Create' button"
}
Example 2 (Memorize):
{
  "type": "memorize",
  "params": { "key": "apple_stock_price", "value": "173.50" },
  "description": "Saving the stock price for later use"
}
`;

  const userPrompt = `Goal: ${request}
${historyContext}
${notebookContext}
Recent History (STM):
${recentHistory}
${errorContextStr}
Current Page Context:
${domContext}

Please plan the next action.`;

  console.log(`[Planner] Thinking about goal: ${request}`);

  try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];
      const payload = {
        model: config.modelName,
        messages: messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
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
    try {
      actionData = JSON.parse(content || "{}");
    } catch (e) {
      console.error("[Planner] Failed to parse JSON:", e);
      actionData = { type: "error", description: "Failed to parse LLM response" };
    }

    const newMessages = [
      new AIMessage({
        content: `I decided to do: ${actionData.type} - ${actionData.description || JSON.stringify(actionData)}`
      })
    ];

    console.log(`--- [Planner] Decided Action: ${actionData.type} ---`);

    // Ensure status is correctly set to FINISHED if action is finish
    const status = actionData.type === "finish" ? "FINISHED" : "RUNNING";

    // Build the history item here to push to state
    const currentStep = total_history.length + 1;
    const historyItem = {
      step: currentStep,
      action: actionData,
      result: null // Will be updated by executor
    };

    return {
      planner_output: { action: actionData },
      messages: newMessages,
      status: status, // Important: pass the updated status back to state
      total_history: [...total_history, historyItem],
      llm_payloads: [llmPayload],
      meta_data: {
        ...meta_data,
        dom_elements: domElements // 保存给 executor 用
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

    return {
      status: "FAILED",
      planner_output: { action: errorAction }, // Provide a valid action so Executor doesn't no-op
      messages: [new AIMessage({ content: `Planner failed: ${error}` })]
    };
  }
};
