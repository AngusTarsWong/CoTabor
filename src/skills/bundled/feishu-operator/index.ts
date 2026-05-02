import { Skill } from "../../types";
import { LarkAuthManager } from "../../../shared/utils/lark-auth";
import { getTenantAccessToken } from "../../../shared/utils/lark-utils";
import { feishuOperatorPrompt } from "../../../prompts";
import { runSubAgentLoop } from "../shared/SubAgentLoop";

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

      // 4. 开启自主思考闭环 (Sub-Agent Loop)
      return await runSubAgentLoop(params.instruction, {
        systemPrompt: feishuOperatorPrompt.system,
        tools: mcpTools.map((t: any) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        modelName,
        apiKey,
        baseUrl,
        tag: "Skill: feishu_operator",
        executeTool: (name, args) => callMcpTool(auth, name, args),
      });

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
