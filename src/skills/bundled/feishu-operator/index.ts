import { Skill } from "../../types";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

const ALLOWED_TOOLS = "fetch-doc,search-doc,create-doc";

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const tokenRes = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    }
  );
  const tokenData = await tokenRes.json();
  if (tokenData.code !== 0) {
    throw new Error(`获取飞书 Token 失败: ${tokenData.msg}`);
  }
  return tokenData.tenant_access_token;
}

async function fetchMcpTools(tat: string) {
  const res = await fetch("https://mcp.feishu.cn/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lark-MCP-TAT": tat,
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

async function callMcpTool(tat: string, name: string, args: any) {
  const res = await fetch("https://mcp.feishu.cn/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lark-MCP-TAT": tat,
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
  params: {
    instruction: "string - 具体的自然语言指令（如'总结飞书上我的最新工作汇报'）"
  },
  
  async execute(params: { instruction: string }, context?: any) {
    console.log("[Skill: feishu_operator] 正在启动专家子代理...");

    // 1. 读取环境凭证 (兼容 Vite 浏览器插件 + Node.js tsx 脚本两种运行环境)
    const env = (typeof process !== 'undefined' && process.env) || {};
    const viteMeta = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    
    const appId = viteMeta.VITE_LARK_APP_ID || env.VITE_LARK_APP_ID || context?.config?.larkAppId;
    const appSecret = viteMeta.VITE_LARK_APP_SECRET || env.VITE_LARK_APP_SECRET || context?.config?.larkAppSecret;
    const apiKey = viteMeta.VITE_LLM_API_KEY || env.VITE_LLM_API_KEY || context?.config?.llmApiKey;
    const baseUrl = viteMeta.VITE_LLM_BASE_URL || env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1';
    const modelName = viteMeta.VITE_LLM_MODEL || env.VITE_LLM_MODEL || 'gpt-4o';
    
    if (!appId || !appSecret) {
      return { status: "FAIL", error: "AUTH_REQUIRED", suggestion: "请在 .env 中配置 VITE_LARK_APP_ID 和 VITE_LARK_APP_SECRET" };
    }
    if (!apiKey) {
      return { status: "FAIL", error: "AUTH_REQUIRED", suggestion: "请配置大模型 API Key" };
    }

    try {
      // 2. 获取 Token 与 Tools (渐进式加载)
      console.log("[Skill: feishu_operator] 获取 Token 与原生 Tool Schema...");
      const tat = await getTenantAccessToken(appId, appSecret);
      const mcpTools = await fetchMcpTools(tat);

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
        new SystemMessage("你是一个极度专业的飞书文档专家。你现在掌握了飞书原生的底层工具。请根据用户的需求，自动检索或读写飞书文档，最后只输出精确、结构化的结果报告，不要废话。"),
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
            const toolResult = await callMcpTool(tat, tc.name, tc.args);
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
