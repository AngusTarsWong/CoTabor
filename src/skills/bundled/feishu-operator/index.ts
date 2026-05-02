import { Skill } from "../../types";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { LarkAuthManager } from "../../../shared/utils/lark-auth";
import { getTenantAccessToken } from "../../../shared/utils/lark-utils";
import { feishuOperatorPrompt } from "../../../prompts";

export * from "./api";

const ALLOWED_TOOLS = "fetch-doc,search-doc,create-doc";

interface McpAuth {
  token: string;
  type: 'TAT' | 'UAT';
}

async function fetchMcpTools(auth: McpAuth) {
  const res = await fetch("https://mcp.feishu.cn/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [`X-Lark-MCP-${auth.type}`]: auth.token,
      "X-Lark-MCP-Allowed-Tools": ALLOWED_TOOLS
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Fetch Tools Fail: ${data.error.message}`);
  return data.result.tools || [];
}

async function callMcpTool(auth: McpAuth, name: string, args: any) {
  const res = await fetch("https://mcp.feishu.cn/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [`X-Lark-MCP-${auth.type}`]: auth.token,
      "X-Lark-MCP-Allowed-Tools": ALLOWED_TOOLS
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: name,
        arguments: args
      }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Tool Call Error [${name}]: ${data.error.message}`);
  
  // MCP returns result.content which is an array of messages
  const contentArray = data.result?.content || [];
  return contentArray.map((item: any) => item.text).join("\n");
}

export const feishuOperatorSkill: Skill = {
  name: "feishu_operator",
  description: "处理所有与飞书相关的文档操作（搜索、读取、新建文档等）。只需传入精确的指令描述。",
  role: "action",
  type: "local",
  auditConfig: { 
    strategy: 'rule_based',
    validator: (result) => result?.skill_result?.status === 'SUCCESS'
  },
  params: {
    instruction: "string - 具体的自然语言指令（如'总结飞书上我的最新工作汇报'）"
  },
  
  async execute(params: { instruction: string }, context?: any) {
    console.log("[Skill: feishu_operator] 正在启动专家子代理...");

    // 1. 读取环境凭证 (兼容 Vite 浏览器插件 + Node.js tsx 脚本两种运行环境)
    const env = (typeof process !== 'undefined' && process.env) || {};
    const viteMeta = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    const stored = typeof chrome !== "undefined" && chrome.storage?.local
      ? await chrome.storage.local.get(["larkAppId", "larkAppSecret", "llmConfig"])
      : {};
    const llmConfig = (stored as any).llmConfig || {};
    
    const appId = (stored as any).larkAppId || viteMeta.VITE_LARK_APP_ID || env.LARK_APP_ID || env.VITE_LARK_APP_ID || context?.config?.larkAppId;
    const appSecret = (stored as any).larkAppSecret || env.LARK_APP_SECRET || env.VITE_LARK_APP_SECRET || context?.config?.larkAppSecret;
    const apiKey = llmConfig.VITE_LLM_API_KEY || env.LLM_API_KEY || env.VITE_LLM_API_KEY || context?.config?.llmApiKey;
    const baseUrl = llmConfig.VITE_LLM_BASE_URL || env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1';
    const modelName = llmConfig.VITE_LLM_MODEL || env.VITE_LLM_MODEL || 'gpt-4o';
    
    if (!appId || !appSecret) {
      return { status: "FAIL", error: "AUTH_REQUIRED", suggestion: "请先在本机 Options 页保存 Feishu App ID / App Secret，或在 Node 环境中配置 LARK_APP_ID / LARK_APP_SECRET。" };
    }
    if (!apiKey) {
      return { status: "FAIL", error: "AUTH_REQUIRED", suggestion: "请配置大模型 API Key" };
    }

    try {
      // 2. 获取 Token 与 Tools (优先使用个人身份 UAT)
      let auth: McpAuth;
      const authManager = LarkAuthManager.getInstance();
      
      if (await authManager.isUserIdentityAvailableAsync()) {
        console.log("[Skill: feishu_operator] 检测到个人身份凭证，正在尝试获取 User Token...");
        const uat = await authManager.getAccessToken();
        auth = { token: uat, type: 'UAT' };
      } else {
        console.log("[Skill: feishu_operator] 未发现个人凭证，回退使用应用身份 (Tenant Token)...");
        const tat = await getTenantAccessToken(appId, appSecret);
        auth = { token: tat, type: 'TAT' };
      }

      console.log(`[Skill: feishu_operator] 身份就绪 (${auth.type})，正在抓取原生 Tool Schema...`);
      const mcpTools = await fetchMcpTools(auth);

      // 3. 组装给 LangChain (OpenAI) 的工具格式
      const openAITools = mcpTools.map((t: any) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      }));

      // 4. 初始化微型专有子模型 (复用主配置的模型)
      console.log(`[Skill: feishu_operator] 子代理模型: ${modelName} @ ${baseUrl}`);
      const llm = new ChatOpenAI({
        modelName: modelName,
        apiKey: apiKey,
        temperature: 0.1,
        configuration: {
          baseURL: baseUrl
        }
      }).bindTools(openAITools);

      // 5. 开启自主思考闭环 (Sub-Agent Loop)
      let messages: any[] = [
        new SystemMessage(feishuOperatorPrompt.system),
        new HumanMessage(params.instruction)
      ];

      console.log(`[Skill: feishu_operator] 开始执行任务: ${params.instruction}`);
      
      const maxIterations = 5;
      for (let i = 0; i < maxIterations; i++) {
        const response = await llm.invoke(messages);
        messages.push(response);

        // 如果模型觉得任务完成，不需要调用工具了，直接返回最终文本
        if (!response.tool_calls || response.tool_calls.length === 0) {
          console.log("[Skill: feishu_operator] 思考结束，完美闭环！");
          return { status: "SUCCESS", data: response.content };
        }

        // 模型决定执行工具
        for (const tc of response.tool_calls) {
          console.log(`[Skill: feishu_operator] 正在执行 MCP Tool: ${tc.name} ...`);
          try {
            const toolResult = await callMcpTool(auth, tc.name, tc.args);
            // 将执行结果返还给模型上下文
            messages.push(new ToolMessage({
              tool_call_id: tc.id!,
              content: toolResult.substring(0, 15000), // 防止超长文档撑爆内存
              name: tc.name
            }));
          } catch (e: any) {
            console.error(`[Skill: feishu_operator] Tool 执行失败:`, e);
            messages.push(new ToolMessage({
               tool_call_id: tc.id!,
               content: `执行报错，请根据错误信息重试或放弃: ${e.message}`,
               name: tc.name
            }));
          }
        }
      }

      return { status: "FAIL", error: "MAX_ITERATIONS", suggestion: "子代理思考超过最大轮数，可能陷入死循环。" };

    } catch (e: any) {
      console.error("[Skill: feishu_operator] 崩溃异常:", e);
      return { status: "FAIL", error: e.message };
    }
  },

  async getManual() {
    return `# 飞书无界化专家使用提示
遇到一切跟飞书相关的查询，不管你在什么网页上，立刻调用 feishu_operator 并向它发号施令。`;
  }
};
