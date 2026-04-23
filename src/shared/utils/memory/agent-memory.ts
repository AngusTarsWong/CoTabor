import { IAgentMemory } from '../logger/interface';
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from '../../types/memory';
import { LocalMemoryProvider } from './local-memory';
import { DocMemoryProvider } from './doc-memory';

/**
 * 统一记忆提供者：
 * 1. L1/L2/L3 结构化记忆 → IndexedDB + 云端同步（Feishu Bitable 或 Notion Database）
 * 2. 网站经验文档 / 任务 SOP 文档 → DocumentService（自动路由到飞书或 Notion）
 *
 * 调用方只需使用这一个类，后端切换对上层完全透明。
 */
export class AgentMemoryProvider implements IAgentMemory {
  private local = new LocalMemoryProvider();
  private doc = new DocMemoryProvider();

  async commitTaskMemories(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    // 1. L1/L2/L3 经验蒸馏（主流程，等待调度结果）
    const result = await this.local.commitTaskMemories(input);

    // 2. 文档记忆写入（火后不管，不阻塞主流程）
    this.writeDocumentMemories(input).catch((e: any) => {
      console.warn('[AgentMemoryProvider] Document memory write failed:', e.message);
    });

    return result;
  }

  private async writeDocumentMemories(input: TaskMemoryCommitInput): Promise<void> {
    const { goal, finalState } = input;
    const buffer = finalState.experience_buffer;
    if (!buffer) return;

    // 按域名聚合 site_insights
    const byDomain = new Map<string, string[]>();
    for (const { domain, content } of buffer.site_insights ?? []) {
      const list = byDomain.get(domain) ?? [];
      list.push(content);
      byDomain.set(domain, list);
    }

    const taskWisdom = buffer.task_wisdom ?? [];

    await Promise.all([
      ...[...byDomain.entries()].map(([domain, insights]) =>
        this.doc.upsertSiteMemory(domain, insights)
      ),
      taskWisdom.length > 0
        ? this.doc.upsertTaskSOP(goal, taskWisdom)
        : Promise.resolve(),
    ]);
  }
}
