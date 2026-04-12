import { Skill } from "../../types";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

export * from "./api";
export * from "./init";

const NOTION_MCP_URL = "https://mcp.notion.com/mcp";

/** Fetch the tool list from the Notion hosted MCP endpoint. */
async function fetchNotionMcpTools(apiKey: string) {
  const res = await fetch(NOTION_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(`Notion MCP tools/list error: ${data.error.message}`);
  return (data.result?.tools ?? []) as any[];
}

/** Call a single tool on the Notion hosted MCP endpoint. */
async function callNotionMcpTool(apiKey: string, name: string, args: any): Promise<string> {
  const res = await fetch(NOTION_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id:      Date.now(),
      method:  "tools/call",
      params:  { name, arguments: args },
    }),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(`Notion MCP tool error [${name}]: ${data.error.message}`);
  const content: any[] = data.result?.content ?? [];
  return content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text as string)
    .join("\n")
    .slice(0, 15_000); // Guard against huge pages
}

export const notionOperatorSkill: Skill = {
  name:        "notion_operator",
  description: "处理所有与 Notion 相关的文档操作（搜索页面、读取内容、创建或更新文档等）。只需传入精确的自然语言指令。",
  role:        "action",
  type:        "local",
  params: {
    instruction: "string - 具体的自然语言指令（如'搜索关于 React 的笔记'或'在 Projects 页下创建一篇新文档'）",
  },

  async execute(params: { instruction: string }, context?: any) {
    console.log("[Skill: notion_operator] 启动专家子代理...");

    // ── Read credentials ──────────────────────────────────────────────────────
    const stored = typeof chrome !== "undefined"
      ? await chrome.storage.local.get(["notionApiKey"])
      : {};
    const viteMeta = (typeof import.meta !== "undefined" && (import.meta as any).env) || {};
    const apiKey: string =
      (stored as any).notionApiKey
      || viteMeta.VITE_NOTION_API_KEY
      || context?.config?.notionApiKey;

    const llmApiKey: string =
      viteMeta.VITE_LLM_API_KEY
      || context?.config?.llmApiKey;
    const baseUrl: string =
      viteMeta.VITE_LLM_BASE_URL
      || context?.config?.llmBaseUrl
      || "https://api.openai.com/v1";
    const modelName: string =
      viteMeta.VITE_LLM_MODEL
      || context?.config?.llmModel
      || "gpt-4o";

    if (!apiKey) {
      return {
        status: "FAIL",
        error:  "NOT_CONFIGURED",
        suggestion: "请在 Options 页「Notion 设置」中填写 Integration Token（以 secret_ 或 ntn_ 开头）",
      };
    }
    if (!llmApiKey) {
      return { status: "FAIL", error: "AUTH_REQUIRED", suggestion: "请配置大模型 API Key" };
    }

    try {
      // ── Fetch tools from Notion MCP ─────────────────────────────────────────
      console.log("[Skill: notion_operator] 正在获取 Notion MCP 工具列表...");
      const mcpTools = await fetchNotionMcpTools(apiKey);

      const openAITools = mcpTools.map((t: any) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));

      // ── Sub-agent loop ──────────────────────────────────────────────────────
      const llm = new ChatOpenAI({
        modelName,
        apiKey: llmApiKey,
        temperature: 0.1,
        configuration: { baseURL: baseUrl },
      }).bindTools(openAITools);

      let messages: any[] = [
        new SystemMessage(
          "你是一个 Notion 文档专家。你掌握了操作 Notion 的底层工具。" +
          "请根据用户的需求，自动检索或读写 Notion 页面和数据库，最后只输出精确、结构化的结果报告，不要废话。"
        ),
        new HumanMessage(params.instruction),
      ];

      const maxIterations = 5;
      for (let i = 0; i < maxIterations; i++) {
        const response = await llm.invoke(messages);
        messages.push(response);

        if (!response.tool_calls || response.tool_calls.length === 0) {
          console.log("[Skill: notion_operator] 思考结束，完美闭环！");
          return { status: "SUCCESS", data: response.content };
        }

        for (const tc of response.tool_calls) {
          console.log(`[Skill: notion_operator] 执行 Notion MCP Tool: ${tc.name}`);
          try {
            const result = await callNotionMcpTool(apiKey, tc.name, tc.args);
            messages.push(new ToolMessage({ tool_call_id: tc.id!, content: result, name: tc.name }));
          } catch (e: any) {
            console.error(`[Skill: notion_operator] Tool 执行失败:`, e);
            messages.push(
              new ToolMessage({
                tool_call_id: tc.id!,
                content:      `执行报错，请根据错误信息重试或放弃: ${e.message}`,
                name:         tc.name,
              })
            );
          }
        }
      }

      return { status: "FAIL", error: "MAX_ITERATIONS", suggestion: "子代理超过最大轮数，可能陷入死循环。" };

    } catch (e: any) {
      console.error("[Skill: notion_operator] 崩溃:", e);
      return { status: "FAIL", error: e.message };
    }
  },

  async getManual() {
    return `# notion_operator
遇到一切跟 Notion 相关的查询或编写需求，立刻调用 notion_operator 并向它发号施令。
需要在 Options 页 Notion 设置中填写 Integration Token 后方可使用。`;
  },
};
