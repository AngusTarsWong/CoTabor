import { Skill } from "../../types";
import { ToolMessage } from "@langchain/core/messages";
import { notionOperatorPrompt } from "../../../prompts";
import { runSubAgentLoop } from "../shared/SubAgentLoop";

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

type NotionOperatorParams = {
  instruction?: string;
  operate_type?: string;
  page_title?: string;
  page_content?: string;
  parent_type?: "page_id" | "database_id";
  parent_id?: string;
  query?: string;
};

function buildInstruction(params: NotionOperatorParams): string | null {
  if (typeof params.instruction === "string" && params.instruction.trim()) {
    return params.instruction.trim();
  }

  if (params.operate_type === "create_page" || params.page_title) {
    const parentHint =
      params.parent_id && params.parent_type
        ? `父节点类型为 ${params.parent_type}，父节点 ID 为 ${params.parent_id}。`
        : "如果不确定父节点，请先搜索合适的父页面或数据库。";
    return [
      `创建一个名为『${params.page_title || "Untitled"}』的新 Notion 页面。`,
      parentHint,
      params.page_content ? `页面内容如下：\n${params.page_content}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (params.operate_type === "search" && params.query) {
    return `在 Notion 中搜索：${params.query}`;
  }

  return null;
}

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
    operate_type: "string - 可选结构化操作类型，如 create_page/search",
    page_title: "string - 可选，新页面标题",
    page_content: "string - 可选，新页面正文",
  },

  async execute(params: NotionOperatorParams, context?: any) {
    console.log("[Skill: notion_operator] Starting specialist sub-agent...");
    const instruction = buildInstruction(params || {});
    if (!instruction) {
      return {
        status: "FAIL",
        error: "INVALID_PARAMS",
        suggestion: "请传入 instruction，或传入 operate_type/page_title/page_content 等结构化参数。",
      };
    }

    // ── Read credentials ──────────────────────────────────────────────────────
    const stored = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
      ? await chrome.storage.local.get(["notionApiKey"])
      : {};
    const processEnv = typeof process !== "undefined" ? process.env : {};
    const llmConfig = typeof chrome !== "undefined" && chrome.storage?.local
      ? await chrome.storage.local.get(["llmConfig"]).then((value) => value.llmConfig || {})
      : {};
    
    const apiKey: string =
      (stored as any).notionApiKey
      || processEnv.VITE_NOTION_API_KEY
      || processEnv.NOTION_API_KEY
      || context?.config?.notionApiKey;

    const llmApiKey: string =
      llmConfig.VITE_LLM_API_KEY
      || processEnv.LLM_API_KEY
      || processEnv.VITE_LLM_API_KEY
      || context?.config?.llmApiKey;
    const baseUrl: string =
      llmConfig.VITE_LLM_BASE_URL
      || processEnv.VITE_LLM_BASE_URL
      || context?.config?.llmBaseUrl
      || "https://api.openai.com/v1";
    const modelName: string =
      llmConfig.VITE_LLM_MODEL
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
      return await runSubAgentLoop(instruction, {
        systemPrompt: notionOperatorPrompt.system,
        tools: LOCAL_NOTION_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        modelName,
        apiKey: llmApiKey,
        baseUrl,
        tag: "Skill: notion_operator",
        executeTool: (name, args) => callLocalNotionTool(apiKey, name, args),
        shouldEarlyExit: (name) => name === "create_page" || name === "append_block",
      });

    } catch (e: any) {
      console.error("[Skill: notion_operator] Unhandled error:", e);
      return { status: "FAIL", error: e.message };
    }
  },

  async getManual() {
    return `# notion_operator
遇到一切跟 Notion 相关的查询或编写需求，立刻调用 notion_operator 并向它发号施令。
需要在 Options 页 Notion 设置中填写 Integration Token 后方可使用。`;
  },
};
