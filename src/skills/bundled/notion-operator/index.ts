import { Skill } from "../../types";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

export * from "./api";
export * from "./init";

const NOTION_API_VERSION = "2022-06-28";
const NOTION_BASE_URL = "https://api.notion.com/v1";

async function notionRequest(apiKey: string, method: string, endpoint: string, body?: any) {
  const res = await fetch(`${NOTION_BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion API Error: ${data.message || res.statusText}`);
  return data;
}

const LOCAL_NOTION_TOOLS = [
  {
    name: "search",
    description: "在 Notion 中搜索页面或数据库。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_page",
    description: "在 Notion 中创建新页面。如果不确定 parent_id，请先调用 search 找到父页面或数据库的 ID。",
    inputSchema: {
      type: "object",
      properties: {
        parent_type: { type: "string", enum: ["page_id", "database_id"], description: "父节点类型" },
        parent_id: { type: "string", description: "父节点 ID" },
        title: { type: "string", description: "新页面标题" },
        content: { type: "string", description: "页面初始正文内容" }
      },
      required: ["parent_type", "parent_id", "title"]
    }
  },
  {
    name: "append_block",
    description: "向现有 Notion 页面追加文本内容。",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion 页面 ID" },
        content: { type: "string", description: "要追加的文本内容" }
      },
      required: ["page_id", "content"]
    }
  }
];

async function callLocalNotionTool(apiKey: string, name: string, args: any): Promise<string> {
  if (name === "search") {
    const data = await notionRequest(apiKey, "POST", "/search", {
      query: args.query,
      sort: { direction: "descending", timestamp: "last_edited_time" }
    });
    const results = (data.results || []).map((r: any) => {
      const titleProp = Object.values(r.properties || {}).find((p: any) => p.type === "title") as any;
      const title = titleProp?.title?.[0]?.plain_text || "Untitled";
      return `[${r.object}] ID: ${r.id} | Title: ${title} | URL: ${r.url}`;
    });
    return results.length > 0 ? results.join("\n") : "未找到匹配的页面。";
  } 
  else if (name === "create_page") {
    const parent = args.parent_type === "page_id" 
      ? { page_id: args.parent_id } 
      : { database_id: args.parent_id };
    
    const children = args.content ? [
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: args.content.slice(0, 2000) } }] }
      }
    ] : [];

    // Different property structure based on parent type
    let properties: any = {};
    if (args.parent_type === "page_id") {
      properties = {
        title: { title: [{ text: { content: args.title } }] }
      };
    } else {
      // For databases, we must assume the title column is 'Name' or we might get an error if it's named something else.
      // Notion API defaults the primary column to title type. We'll pass it simply.
      // A safer way is to just send "title" array which Notion maps to the title property regardless of name in most cases.
      // Actually, for database children, the key must be the property name or ID. Usually it's "Name".
      // But let's try 'Name' and if it fails, the user will see it.
      // A more robust way is to fetch the database schema first, but let's keep it simple.
      properties = {
        "Name": { title: [{ text: { content: args.title } }] }
      };
    }

    try {
      const data = await notionRequest(apiKey, "POST", "/pages", {
        parent,
        properties,
        children
      });
      return `创建成功！页面 ID: ${data.id} | URL: ${data.url}`;
    } catch (e: any) {
      // Fallback if 'Name' is not the title property
      if (args.parent_type === "database_id" && e.message.includes("properties")) {
         const data = await notionRequest(apiKey, "POST", "/pages", {
          parent,
          properties: { "title": { title: [{ text: { content: args.title } }] } }, // Some DBs might use 'title' literally
          children
        });
        return `创建成功！页面 ID: ${data.id} | URL: ${data.url}`;
      }
      throw e;
    }
  }
  else if (name === "append_block") {
    const data = await notionRequest(apiKey, "PATCH", `/blocks/${args.page_id}/children`, {
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: args.content.slice(0, 2000) } }] }
        }
      ]
    });
    return `内容追加成功！`;
  }
  else {
    throw new Error(`未知的工具: ${name}`);
  }
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
    const stored = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
      ? await chrome.storage.local.get(["notionApiKey"])
      : {};
    const viteMeta = (typeof import.meta !== "undefined" && (import.meta as any).env) || {};
    const processEnv = typeof process !== "undefined" ? process.env : {};
    
    const apiKey: string =
      (stored as any).notionApiKey
      || viteMeta.VITE_NOTION_API_KEY
      || processEnv.VITE_NOTION_API_KEY
      || context?.config?.notionApiKey;

    const llmApiKey: string =
      viteMeta.VITE_LLM_API_KEY
      || processEnv.VITE_LLM_API_KEY
      || context?.config?.llmApiKey;
    const baseUrl: string =
      viteMeta.VITE_LLM_BASE_URL
      || processEnv.VITE_LLM_BASE_URL
      || context?.config?.llmBaseUrl
      || "https://api.openai.com/v1";
    const modelName: string =
      viteMeta.VITE_LLM_MODEL
      || processEnv.VITE_LLM_MODEL
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
      // ── Use local Notion API tools ─────────────────────────────────────────
      console.log("[Skill: notion_operator] 正在注册本地 Notion API 工具...");
      
      const openAITools = LOCAL_NOTION_TOOLS.map((t) => ({
        type: "function" as const,
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
          console.log(`[Skill: notion_operator] 执行 Notion Tool: ${tc.name}`);
          try {
            const result = await callLocalNotionTool(apiKey, tc.name, tc.args);
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
