import { IAgentLogger, LoggerConfig } from './interface';
import { DocBlock } from '../../types/document-provider';
import { DocumentService } from '../document/document-service';

export class DocLogger implements IAgentLogger {
  private documentId?: string;
  private documentUrl?: string;

  async init(config: LoggerConfig): Promise<void> {
    const service = await DocumentService.getInstance();
    if (!service) return;

    const folder = await service.getDefaultFolder('logs');
    const title = `[CoTabor 运行日志] ${config.goal.substring(0, 30)}... - ${new Date(config.timestamp).toLocaleString()}`;
    this.documentId = await service.createDocument(title, folder || undefined);
    this.documentUrl = service.getDocumentUrl(this.documentId);

    await service.appendContent(this.documentId, [
      { type: 'heading', level: 1, content: '🚀 执行概览' },
      { type: 'paragraph', content: `目标: ${config.goal}\n标签页ID: ${config.tabId}\n启动时间: ${new Date(config.timestamp).toLocaleString()}` },
      { type: 'divider' },
    ]);

    console.log(`[DocLogger] Log document created: ${this.documentUrl}`);
  }

  async logStep(step: { node: string; update: any }): Promise<void> {
    if (!this.documentId) return;
    const service = await DocumentService.getInstance();
    if (!service) return;

    try {
      const { node, update } = step;
      const blocks: DocBlock[] = [];

      blocks.push({ type: 'heading', level: 2, content: `📦 [[ ${node.toUpperCase()} ]]` });

      if (update.task_list && update.task_list.length > 0) {
        blocks.push({ type: 'heading', level: 3, content: '📋 当前任务进度:' });
        update.task_list.forEach((t: any) => {
          blocks.push({ type: 'bullet', content: `[${t.status}] ${t.goal}` });
        });
      }

      if (update.llm_payloads && update.llm_payloads.length > 0) {
        const payload = update.llm_payloads[update.llm_payloads.length - 1];
        if (payload.node === node) {
          blocks.push({ type: 'heading', level: 3, content: `📥 LLM Input (${payload.payload.model})` });
          const messages = payload.payload.messages || [];
          const inputText = messages.map((m: any) =>
            `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
          ).join('\n---\n');
          blocks.push({ type: 'code', content: inputText.substring(0, 5000) });

          blocks.push({ type: 'heading', level: 3, content: '📤 LLM Output' });
          blocks.push({ type: 'code', content: payload.response });
        }
      }

      if (update.watchdog_output) {
        const isPass = update.watchdog_output.status === 'PASS';
        blocks.push({ type: 'heading', level: 3, content: `🔍 审计结果: ${isPass ? '通过 ✅' : '未通过 ❌'}` });
        blocks.push({ type: 'paragraph', content: `理由: ${update.watchdog_output.reason || '无'}` });

        if (update.total_history && update.total_history.length > 0) {
          const lastHistory = update.total_history[update.total_history.length - 1];
          if (lastHistory.step_summary) {
            blocks.push({ type: 'paragraph', italic: true, content: `过程摘要: ${lastHistory.step_summary}` });
          }
        }
      }

      if (update.experience_buffer) {
        const { site_insights, tool_insights, task_wisdom } = update.experience_buffer;
        const hasInsights =
          (site_insights && site_insights.length > 0) ||
          (tool_insights && tool_insights.length > 0) ||
          (task_wisdom && task_wisdom.length > 0);

        if (hasInsights) {
          blocks.push({ type: 'heading', level: 3, content: '💡 经验闪念 (Real-time Insights)' });
          site_insights?.forEach((si: any) => {
            blocks.push({ type: 'bullet', content: `[网站经验] ${si.domain}: ${si.content}` });
          });
          tool_insights?.forEach((ti: any) => {
            blocks.push({ type: 'bullet', content: `[工具经验] ${ti.skillName}: ${ti.content}` });
          });
          task_wisdom?.forEach((tw: string) => {
            blocks.push({ type: 'bullet', content: `[方法论] ${tw}` });
          });
        }
      }

      if (update.long_term_memory?.notebook && Object.keys(update.long_term_memory.notebook).length > 0) {
        blocks.push({ type: 'heading', level: 3, content: '📝 记忆提取 (Memory/Notebook)' });
        const formattedNotebook = Object.entries(update.long_term_memory.notebook)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n');
        blocks.push({ type: 'code', content: formattedNotebook });
      }

      blocks.push({ type: 'divider' });
      await service.appendContent(this.documentId, blocks);
    } catch (error: any) {
      console.error('[DocLogger] logStep failed:', error.message);
    }
  }

  async finish(finalState: any): Promise<void> {
    if (!this.documentId) return;
    const service = await DocumentService.getInstance();
    if (!service) return;

    try {
      await service.appendContent(this.documentId, [
        { type: 'heading', level: 1, content: `🏁 任务结束 - 状态: ${finalState.status}` },
        {
          type: 'paragraph',
          content: finalState.status === 'FINISHED'
            ? '✅ 任务已成功完成。'
            : `❌ 任务失败原因: ${finalState.error ?? '未知错误'}`,
        },
      ]);
      console.log(`[DocLogger] Log finished: ${this.documentUrl}`);
    } catch (error: any) {
      console.error('[DocLogger] finish failed:', error.message);
    }
  }

  getLogUrl(): string {
    return this.documentUrl ?? '';
  }
}
