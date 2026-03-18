import { Skill } from "../../types";
import { FeishuBrowserConnector } from "../../../connectors/feishu-browser/index";

export const feishuReadDocSkill: Skill = {
  name: "feishu_read_doc",
  description: "提取并结构化读取当前飞书文档（Doc/Docx）的正文内容。",
  role: "action",
  type: "local",
  gating: {
    url_pattern: ".*://.*.feishu.cn/docs/.*|.*://.*.larksuite.com/docs/.*" // Updated regex to match connector logic
  },
  params: {
    format: "enum: ['markdown', 'raw_text'] - 希望返回的内容格式"
  },
  
  async execute(params: { format?: string }, context?: { tabId?: number }) {
    console.log("[Skill: feishu_read_doc] Executing with params:", params);
    
    // In a real implementation, we would need the tabId from the context
    // For now, we'll assume the connector or executor provides it
    const tabId = context?.tabId;
    if (!tabId) {
      throw new Error("Missing tabId in execution context. Cannot read Feishu document.");
    }

    try {
      // Use the underlying connector engine to read the document
      const content = await FeishuBrowserConnector.readDocument(tabId);
      
      return {
        status: "SUCCESS",
        data: content
      };
    } catch (error: any) {
      console.error("[Skill: feishu_read_doc] Error:", error);
      return {
        status: "FAIL",
        error: error.message || String(error),
        suggestion: "飞书页面结构可能已更新或需要登录，建议降级使用 CDP 'read_dom' 动作或引导用户登录。"
      };
    }
  },

  async getManual() {
    // In a real app, this would read from SKILL.md
    return `
# Agent 使用指南 (Prompt)
当用户要求你总结当前飞书文档、查找文档内信息时，必须优先使用此技能。
注意：此技能不需要传入 URL，它会自动读取用户当前正在浏览的 Tab 页。
如果返回 "AUTH_REQUIRED"，请降级使用 CDP Action 引导用户登录。
    `;
  }
};