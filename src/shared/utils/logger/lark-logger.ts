import { IAgentLogger, LoggerConfig } from "./interface";
import { ENV } from "../../constants/env";
import { getLarkToken, appendBlocks } from "../lark-utils";

export class LarkLogger implements IAgentLogger {
  private documentId?: string;
  private documentUrl?: string;
  private accessToken?: string;

  async init(config: LoggerConfig): Promise<void> {
    console.log("[LarkLogger] Initializing Feishu Doc Log...");
    
    const appId = ENV.LARK_APP_ID;
    const appSecret = ENV.LARK_APP_SECRET;
    const folderToken = ENV.LARK_LOGS_FOLDER;

    if (!appId || !appSecret) {
      throw new Error("LARK_LOGGER_ERROR: VITE_LARK_APP_ID/SECRET 缺失，无法启动飞书日志。");
    }

    try {
      this.accessToken = await getLarkToken(appId, appSecret);

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
      if (!this.documentId) throw new Error("Document ID not returned");
      
      this.documentUrl = `https://www.feishu.cn/docx/${this.documentId}`;
      
      console.log(`[LarkLogger] Log Document Created: ${this.documentUrl}`);

      await appendBlocks(this.accessToken, this.documentId, [
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

      blocks.push(this.createHeadingBlock(2, `📦 [[ ${node.toUpperCase()} ]]`));

      if (update.task_list && update.task_list.length > 0) {
        blocks.push(this.createHeadingBlock(3, "📋 当前任务进度:"));
        update.task_list.forEach((t: any) => {
          blocks.push(this.createBulletBlock(`[${t.status}] ${t.goal}`));
        });
      }

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

      // --- Triple-Core Memory: Real-time Insights ---
      if (update.experience_buffer) {
        const { site_insights, tool_insights, task_wisdom } = update.experience_buffer;
        if ((site_insights && site_insights.length > 0) || (tool_insights && tool_insights.length > 0) || (task_wisdom && task_wisdom.length > 0)) {
          blocks.push(this.createHeadingBlock(3, "💡 经验闪念 (Real-time Insights)"));
          
          site_insights?.forEach((si: any) => {
            blocks.push(this.createBulletBlock(`[网站经验] ${si.domain}: ${si.content}`));
          });
          tool_insights?.forEach((ti: any) => {
            blocks.push(this.createBulletBlock(`[工具经验] ${ti.skillName}: ${ti.content}`));
          });
          task_wisdom?.forEach((tw: string) => {
            blocks.push(this.createBulletBlock(`[方法论] ${tw}`));
          });
        }
      }

      if (update.long_term_memory?.notebook && Object.keys(update.long_term_memory.notebook).length > 0) {
        const notebook = update.long_term_memory.notebook;
        blocks.push(this.createHeadingBlock(3, "📝 记忆提取 (Memory/Notebook)"));
        const formattedNotebook = Object.entries(notebook).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
        blocks.push(this.createCodeBlock(formattedNotebook));
      }

      blocks.push({ block_type: 22, divider: {} });
      await appendBlocks(this.accessToken, this.documentId, blocks);
    } catch (error: any) {
      console.error("[LarkLogger] LogStep Failed:", error.message);
    }
  }

  async finish(finalState: any): Promise<void> {
    if (!this.documentId || !this.accessToken) return;
    try {
      await appendBlocks(this.accessToken, this.documentId, [
        this.createHeadingBlock(1, `🏁 任务结束 - 状态: ${finalState.status}`),
        this.createTextBlock(finalState.status === 'FINISHED' ? "✅ 任务已成功完成。" : `❌ 任务失败原因: ${finalState.error || '未知错误'}`)
      ]);
      console.log(`[LarkLogger] Log Finished: ${this.documentUrl}`);
    } catch (error: any) {
      console.error("[LarkLogger] Finish Failed:", error.message);
    }
  }

  getLogUrl(): string {
    return this.documentUrl || "";
  }

  private createTextBlock(content: string, style: any = {}) {
    return { block_type: 2, text: { elements: [{ text_run: { content, text_element_style: style } }] } };
  }

  private createHeadingBlock(level: 1 | 2 | 3, content: string) {
    const typeMap: Record<number, number> = { 1: 3, 2: 4, 3: 5 };
    const dataKey = `heading${level}`;
    return { block_type: typeMap[level], [dataKey]: { elements: [{ text_run: { content, text_element_style: { bold: true } } }] } };
  }

  private createBulletBlock(content: string) {
    return { block_type: 12, bullet: { elements: [{ text_run: { content } }] } };
  }

  private createCodeBlock(content: string) {
    return { block_type: 14, code: { elements: [{ text_run: { content } }], language: 15 } };
  }
}
