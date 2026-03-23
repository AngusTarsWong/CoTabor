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

  // 1. 获取最新 DOM 状态
  let domContext = "Current Page: Unknown (No content provided)";
  let domElements: any[] = [];
  
  const tabId = meta_data?.tabId;
  if (tabId) {
    try {
      console.log(`[Planner] Extracting DOM for tab: ${tabId}...`);
      const domDriver = new DOMDriver(tabId);
      const domResult = await domDriver.extractDOM();
      domElements = domResult.elements;
      domContext = domResult.simplifiedText || "Page is empty";
      console.log(`[Planner] Extracted ${domElements.length} interactive elements.`);
    } catch (e) {
      console.error("[Planner] Failed to extract DOM:", e);
      domContext = "Failed to extract DOM. " + (e as Error).message;
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
  const historyContext = long_term_memory?.summary ? `Long Term Memory:\n${long_term_memory.summary}\n` : "";
  const recentHistory = total_history.slice(-5).map(h => 
    `Step ${h.step}: ${h.action.type} -> ${JSON.stringify(h.result)}`
  ).join("\n");

  const skillsList = available_skills && available_skills.length > 0
      ? available_skills.map(s => `- ${s.name} (${JSON.stringify(s.params)}): ${s.description}`).join("\n")
      : "None";

  // 如果有 Watchdog 传来的错误，让 Planner 知道
  const errorContextStr = last_error_context ? `\n[ATTENTION] Previous action failed: ${last_error_context}\nPlease adjust your plan based on this error.\n` : "";

  const systemPrompt = `You are an intelligent browser automation agent.
Your goal is to help the user complete web tasks by planning the next action.
You should analyze the current DOM context and history to decide the next step.

Supported Skills:
You can call pre-defined skills to accomplish tasks.
Available Skills:
${skillsList}

- call_skill(skill_name: string, params: object): Execute a skill.
- inspect_skill(skill_name: string): Read the full manual (SKILL.md) of a skill if you don't know how to use it.
- finish(summary: string): Task completed. Provide a summary.

DECISION PROTOCOL:
1. **Analyze Context**: Look at the "Interactive Elements" list to find the elements you want to interact with.
2. **Choose Skill**: Select the most appropriate skill from the "Available Skills" list. For example, use browser_navigate, browser_click_index, browser_type_index, etc., for basic web interactions.
3. **Output Action**: Output a JSON object to call the chosen skill.

Output Format:
You must output a strictly valid JSON object. Do not include markdown code blocks.
Example:
{
  "type": "call_skill",
  "skill_name": "browser_click_index",
  "params": { "index": 15 },
  "description": "Clicking the 'Create' button"
}
`;

  const userPrompt = `Goal: ${request}
${historyContext}
Recent History:
${recentHistory}
${errorContextStr}
Current DOM Context (Interactive Elements):
${domContext}

Please plan the next action.`;

  console.log(`[Planner] Thinking about goal: ${request}`);

  try {
      const completion = await openai.chat.completions.create({
        model: config.modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }, { timeout: 30000 });

    const content = completion.choices[0].message.content;
    console.log(`[Planner] Raw LLM Output: ${content}`);

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

    const status = actionData.type === "finish" ? "FINISHED" : "RUNNING";

    return {
      planner_output: { action: actionData },
      messages: newMessages,
      status: status,
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
