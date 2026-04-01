import { IAgentLogger, LoggerConfig } from "./interface";
import { LarkAuthManager } from "../lark-auth";
import { ENV } from "../../constants/env";

export class LarkLogger implements IAgentLogger {
  private documentId?: string;
  private documentUrl?: string;
  private accessToken?: string;

  async init(config: LoggerConfig): Promise<void> {
    console.log("[LarkLogger] Initializing Feishu Doc Log...");
    
    const appId = ENV.LARK_APP_ID;
    const appSecret = ENV.LARK_APP_SECRET;
    const folderToken = ENV.LARK_LOG_FOLDER;

    if (!appId || !appSecret) {
      throw new Error("LARK_LOGGER_ERROR: VITE_LARK_APP_ID/SECRET 缺失，无法启动飞书日志。");
    }

    try {
      // 1. 获取 Token (优先使用个人身份 UAT)
      const authManager = LarkAuthManager.getInstance();
      if (authManager.isUserIdentityAvailable()) {
        console.log("[LarkLogger] 正在获取个人身份凭证 (UAT)...");
        this.accessToken = await authManager.getAccessToken();
      } else {
        console.log("[LarkLogger] 未发现个人凭证，正在获取应用身份 (TAT)...");
        this.accessToken = await this.getTenantAccessToken(appId, appSecret);
      }

      // 2. 创建文档
      const title = `[CoTabor 运行日志] ${config.goal.substring(0, 30)}... - ${new Date(config.timestamp).toLocaleString()}`;
      const createRes = await fetch("https://open.feishu.cn/open-apis/docx/v1/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          folder_token: folderToken || undefined,
          title: title
        })
      });

      const createData: any = await createRes.json();
      if (createData.code !== 0) {
        throw new Error(`创建文档失败: ${createData.msg} (Code: ${createData.code})`);
      }

      this.documentId = createData.data.document.document_id;
      this.documentUrl = `https://www.feishu.cn/docx/${this.documentId}`;
      
      console.log(`[LarkLogger] Log Document Created: ${this.documentUrl}`);

      // 3. 写入初始信息
      await this.appendBlocks([
        this.createHeadingBlock(1, "🚀 执行概览"),
        this.createTextBlock(`目标: ${config.goal}\n标签页ID: ${config.tabId}\n启动时间: ${new Date(config.timestamp).toLocaleString()}`),
        { block_type: 22, divider: {} }
      ]);

    } catch (error: any) {
      console.error("[LarkLogger] Init Failed:", error.message);
      throw error;
    }
  }

  async logStep(step: { node: string; update: any }): Promise<void> {
    if (!this.documentId || !this.accessToken) return;

    try {
      const { node, update } = step;
      const blocks: any[] = [];

      // A. 节点标题
      blocks.push(this.createHeadingBlock(2, `📦 [[ ${node.toUpperCase()} ]]`));

      // B. 任务进度
      if (update.task_list && update.task_list.length > 0) {
        blocks.push(this.createHeadingBlock(3, "📋 当前任务进度:"));
        update.task_list.forEach((t: any) => {
          blocks.push(this.createBulletBlock(`[${t.status}] ${t.goal}`));
        });
      }

      // C. LLM 详细记录
      if (update.llm_payloads && update.llm_payloads.length > 0) {
        const payload = update.llm_payloads[update.llm_payloads.length - 1];
        if (payload.node === node) {
          blocks.push(this.createHeadingBlock(3, `📥 LLM Input (${payload.payload.model})`));
          
          const messages = payload.payload.messages || [];
          const inputText = messages.map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join("\n---\n");
          
          blocks.push(this.createCodeBlock(inputText.substring(0, 5000)));

          blocks.push(this.createHeadingBlock(3, `📤 LLM Output`));
          blocks.push(this.createCodeBlock(payload.response));
        }
      }

      // D. 动作决策详情
      if (node === 'planner' && update.planner_output?.action) {
        blocks.push(this.createHeadingBlock(3, "🎯 决策行动:"));
        blocks.push(this.createTextBlock(`${update.planner_output.action.type}`, { italic: true }));
      }

      // E. 执行器反馈
      if (node === 'executor' && update.meta_data?.page_content) {
          const result = update.meta_data.page_content;
          if (result.startsWith('[Skill Result:')) {
            blocks.push(this.createHeadingBlock(3, "📄 执行反馈 (Execution Feedback)"));
            blocks.push(this.createCodeBlock(result.substring(0, 5000)));
          }
      }

      // F. 看门狗审计结果
      if (update.watchdog_output) {
        const isPass = update.watchdog_output.status === "PASS";
        blocks.push(this.createHeadingBlock(3, `🔍 审计结果: ${isPass ? "通过 ✅" : "未通过 ❌"}`));
        blocks.push(this.createTextBlock(`理由: ${update.watchdog_output.reason || "无"}`));
        
        if (update.total_history && update.total_history.length > 0) {
          const lastHistory = update.total_history[update.total_history.length - 1];
          if (lastHistory.step_summary) {
            blocks.push(this.createTextBlock(`过程摘要: ${lastHistory.step_summary}`, { italic: true }));
          }
        }
      }

      // G. 重规划战略
      if (update.replan_context) {
        blocks.push(this.createHeadingBlock(3, "🧠 战略重规划方案"));
        blocks.push(this.createTextBlock(update.replan_context));
      }

      // H. 记忆提取 (Notebook)
      if (update.long_term_memory?.notebook && Object.keys(update.long_term_memory.notebook).length > 0) {
        const notebook = update.long_term_memory.notebook;
        blocks.push(this.createHeadingBlock(3, "📝 记忆提取 (Memory/Notebook)"));
        const formattedNotebook = Object.entries(notebook).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
        blocks.push(this.createCodeBlock(formattedNotebook));
      }

      blocks.push({ block_type: 22, divider: {} });

      await this.appendBlocks(blocks);
    } catch (error: any) {
      console.error("[LarkLogger] LogStep Failed:", error.message);
      throw error;
    }
  }

  async finish(finalState: any): Promise<void> {
    if (!this.documentId || !this.accessToken) return;

    try {
      await this.appendBlocks([
        this.createHeadingBlock(1, `🏁 任务结束 - 状态: ${finalState.status}`),
        this.createTextBlock(finalState.status === 'FINISHED' ? "✅ 任务已成功完成。" : `❌ 任务失败原因: ${finalState.error || '未知错误'}`)
      ]);
      console.log(`[LarkLogger] Log Finished. Final Summary added to ${this.documentUrl}`);
    } catch (error: any) {
      console.error("[LarkLogger] Finish Failed:", error.message);
    }
  }

  getLogUrl(): string {
    return this.documentUrl || "";
  }

  // --- Block Factory Helpers ---

  private createTextBlock(content: string, style: any = {}) {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content, text_element_style: style } }]
      }
    };
  }

  private createHeadingBlock(level: 1 | 2 | 3, content: string) {
    const typeMap = { 1: 3, 2: 4, 3: 5 };
    const dataKey = `heading${level}`;
    return {
      block_type: typeMap[level],
      [dataKey]: {
        elements: [{ text_run: { content, text_element_style: { bold: true } } }]
      }
    };
  }

  private createBulletBlock(content: string) {
    return {
      block_type: 12,
      bullet: {
        elements: [{ text_run: { content } }]
      }
    };
  }

  private createCodeBlock(content: string) {
    return {
      block_type: 14,
      code: {
        elements: [{ text_run: { content } }],
        language: 15 // Markdown style
      }
    };
  }

  // --- Network Helpers ---

  private async getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const data: any = await res.json();
    if (data.code !== 0) throw new Error(`Auth Failed: ${data.msg}`);
    return data.tenant_access_token;
  }

  private async appendBlocks(blocks: any[]): Promise<void> {
    if (!this.documentId || !this.accessToken) return;

    const chunkSize = 50;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      const res = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${this.documentId}/blocks/${this.documentId}/children`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          children: chunk
        })
      });

      const data: any = await res.json();
      if (data.code !== 0) {
        console.error("[LarkLogger] Append Failed payload:", JSON.stringify({ children: chunk }, null, 2));
        throw new Error(`追加内容失败: ${data.msg} (Code: ${data.code})`);
      }
    }
  }
}
