import { Skill } from "../../types";

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
    
    // 模拟网络延迟和操作时间
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 生成一个假的飞书文档链接
    const mockDocId = Math.random().toString(36).substring(2, 10);
    const mockUrl = `https://feishu.cn/docx/${mockDocId}`;

    console.log(`[Skill: feishu_write_doc] 文档创建成功! 链接: ${mockUrl}`);

    return {
      status: "SUCCESS",
      doc_url: mockUrl,
      title: params.title,
      message: "文档已成功创建并写入内容。"
    };
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