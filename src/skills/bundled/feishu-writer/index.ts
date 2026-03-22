import { Skill } from "../../types";
import { FeishuBrowserConnector } from "../../../connectors/feishu-browser/index";

export const feishuWriteDocSkill: Skill = {
  name: "feishu_write_doc",
  description: "创建一个新的飞书文档并将内容写入其中，返回文档链接。",
  role: "action",
  type: "local",
  params: {
    title: "string - 文档的标题",
    content: "string - 要写入文档的具体内容（支持 Markdown）"
  },
  
  async execute(params: { title: string; content: string }, context?: { tabId?: number }) {
    console.log(`[Skill: feishu_write_doc] 正在创建文档: ${params.title}`);
    
    const tabId = context?.tabId;
    if (!tabId) {
      throw new Error("Missing tabId in execution context. Cannot control browser to write Feishu document. Please ensure browser is attached.");
    }

    try {
      // Use the real browser connector to automate doc creation
      const docUrl = await FeishuBrowserConnector.writeDocument(tabId, params.title, params.content);

      console.log(`[Skill: feishu_write_doc] 文档创建成功! 链接: ${docUrl}`);

      return {
        status: "SUCCESS",
        doc_url: docUrl,
        title: params.title,
        message: "文档已成功创建并写入内容。"
      };
    } catch (error: any) {
      console.error("[Skill: feishu_write_doc] Error:", error);
      return {
        status: "FAIL",
        error: error.message || String(error),
        suggestion: "浏览器自动化失败，可能需要重新登录或页面结构发生变化。"
      };
    }
  },

  async getManual() {
    return `
# Skill: feishu_write_doc
用于自动化创建飞书文档并写入内容。
当用户要求“保存到飞书”、“写入飞书文档”时，请调用此技能。

参数：
- title: 文档标题
- content: 文档正文内容

返回：
包含新创建文档的 URL (doc_url) 的 JSON 对象。
    `;
  }
};