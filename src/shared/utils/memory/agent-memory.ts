import { IAgentMemory } from '../logger/interface';
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from '../../types/memory';
import { LocalMemoryProvider } from './local-memory';
import { DocMemoryProvider } from './doc-memory';

/**
 * Unified memory provider:
 * 1. L1/L2/L3 structured memory -> IndexedDB + cloud sync
 * 2. Site knowledge and task SOP docs -> `DocumentService`
 *
 * Callers use one façade and remain agnostic to the active backend.
 */
export class AgentMemoryProvider implements IAgentMemory {
  private local = new LocalMemoryProvider();
  private doc = new DocMemoryProvider();

  async commitTaskMemories(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    const result = await this.local.commitTaskMemories(input);

    // Fire-and-forget document persistence so the main task result is not blocked.
    this.writeDocumentMemories(input).catch((e: any) => {
      console.warn('[AgentMemoryProvider] Document memory write failed:', e.message);
    });

    return result;
  }

  private async writeDocumentMemories(input: TaskMemoryCommitInput): Promise<void> {
    const { goal, finalState } = input;
    const buffer = finalState.experience_buffer;
    if (!buffer) return;

    // Group site insights by domain before upserting site-level memory.
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
