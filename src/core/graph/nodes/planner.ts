import { AgentState } from "../state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import OpenAI from "openai";
import { ENV } from "../../../shared/constants/env";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Planner] ---");
  
  const { request, screenshot, total_history, long_term_memory, meta_data, available_skills } = state;
  const config = ENV.PLANNER_CONFIG;

  if (!config.enabled) {
    throw new Error("Planner model is disabled in configuration.");
  }

  // 1. 初始化 OpenAI 客户端
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true // 允许在浏览器环境运行
  });

  // 2. 构建 Prompt
  const historyContext = long_term_memory?.summary ? `Long Term Memory:\n${long_term_memory.summary}\n` : "";
  const recentHistory = total_history.slice(-5).map(h => 
    `Step ${h.step}: ${h.action.type} -> ${JSON.stringify(h.result)}`
  ).join("\n");

  const pageContext = meta_data?.page_content || "Current Page: Unknown (No content provided)";

  const skillsList = available_skills && available_skills.length > 0
      ? available_skills.map(s => `- ${s.name} [${s.role}]: ${s.description}`).join("\n")
      : "None";

  const systemPrompt = `You are an intelligent browser automation agent.
Your goal is to help the user complete web tasks by planning the next action.
You should analyze the current page content and history to decide the next step.

Supported Actions (Low-level):
- type(selector: string, text: string): Type text into an input field.
- click(selector: string): Click on an element.
- scroll(direction: "up" | "down"): Scroll the page.
- read(selector: string): Read the text content of an element.

Supported Skills (High-level):
You can call pre-defined skills to accomplish complex tasks directly.
Available Skills:
${skillsList}

- call_skill(skill_name: string, params: object): Execute a high-level skill.
- inspect_skill(skill_name: string): Read the full manual (SKILL.md) of a skill if you don't know how to use it.

- finish(summary: string): Task completed. Provide a summary.

DECISION PROTOCOL:
1. **Check Skills First**: Look at the "Available Skills" list.
   - If a skill matches the user's intent perfectly (e.g., user wants to "read feishu", and you have "read_feishu_doc"), YOU MUST USE IT.
   - Output: { "type": "call_skill", "skill_name": "read_feishu_doc", ... }

2. **Fallback to Browser Actions**: Only if NO skill is relevant:
   - Break down the task into small steps (click, type, scroll).
   - Output: { "type": "click", "selector": "..." }

Output Format:
You must output a strictly valid JSON object. Do not include markdown code blocks.
Example:
{
  "type": "type",
  "selector": "#search-input",
  "text": "Google News",
  "description": "Typing 'Google News' into the search bar"
}
`;

  const userPrompt = `Goal: ${request}

${historyContext}

Recent History:
${recentHistory}

Current Page Context (Simplified):
${pageContext}

Please plan the next action.`;

  console.log(`[Planner] Thinking about goal: ${request}`);
  console.log(`[Planner] Using model: ${config.modelName}`);

  try {
    // 3. 调用 LLM
    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2, // 保持较低的温度以获得稳定的 JSON
      response_format: { type: "json_object" }, // 强制 JSON 模式 (如果模型支持)
      timeout: 30000 // Increase timeout to 30 seconds
    });

    const content = completion.choices[0].message.content;
    console.log(`[Planner] Raw LLM Output: ${content}`);

    let actionData;
    try {
      actionData = JSON.parse(content || "{}");
    } catch (e) {
      console.error("[Planner] Failed to parse JSON:", e);
      // Fallback or retry logic could go here
      actionData = { type: "error", description: "Failed to parse LLM response" };
    }

    // 4. 构建供 UI 展示的 Message 记录
    const newMessages = [];
    if (screenshot) {
      newMessages.push(new HumanMessage({
        content: [
          { type: "text", text: "Planner Input Screen" },
        ]
      }));
    }
    
    newMessages.push(new AIMessage({
      content: `I decided to do: ${actionData.type} - ${actionData.description}`
    }));

    console.log(`--- [Planner] Decided Action: ${actionData.type} ---`);

    // 5. 返回规划结果更新 State
    // 如果 LLM 决定 finish，我们将状态标记为 FINISHED
    const status = actionData.type === "finish" ? "FINISHED" : "RUNNING";

    return {
      planner_output: { action: actionData },
      messages: newMessages,
      status: status
    };

  } catch (error) {
    console.error("[Planner] LLM Call Failed:", error);
    
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
