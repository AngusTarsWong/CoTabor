import { IAgentMemory } from '../logger/interface';
import { DocBlock } from '../../types/document-provider';
import { DocumentService } from '../document/document-service';
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from '../../types/memory';

export class DocMemoryProvider implements IAgentMemory {
  async commitTaskMemories(_input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    console.warn('[DocMemory] commitTaskMemories is not implemented for task-level tri-memory pipeline.');
    return {
      scheduled: false,
      experienceStatus: 'FAILED',
      candidates: 0,
      committed: { L1: 0, L2: 0, L3: 0, DROP: 0 },
    };
  }

  async upsertSiteMemory(domain: string, insights: string[]): Promise<void> {
    const service = await DocumentService.getInstance();
    if (!service) return;

    const folder = await service.getDefaultFolder('sites');
    if (!folder) return;

    try {
      let docId = await service.findDocument(folder, domain);
      if (!docId) {
        console.log(`[DocMemory] Creating new site memory for ${domain}...`);
        docId = await service.createDocument(domain, folder);
        await service.appendContent(docId, [
          { type: 'heading', level: 1, content: `🌐 ${domain} 网站经验地图` },
          { type: 'divider' },
        ]);
      }

      const blocks: DocBlock[] = insights.map(i => ({
        type: 'bullet' as const,
        content: `${i} (发现于 ${new Date().toLocaleDateString()})`,
      }));
      await service.appendContent(docId, blocks);
      console.log(`[DocMemory] Updated site memory for ${domain} (${insights.length} insights)`);
    } catch (error: any) {
      console.error(`[DocMemory] Failed to upsert site memory: ${error.message}`);
    }
  }

  async upsertTaskSOP(goal: string, wisdom: string[]): Promise<void> {
    const service = await DocumentService.getInstance();
    if (!service) return;

    const folder = await service.getDefaultFolder('tasks');
    if (!folder) return;

    const fileName = goal.substring(0, 50).replace(/[\\/:*?"<>|]/g, '_');

    try {
      let docId = await service.findDocument(folder, fileName);
      if (!docId) {
        console.log(`[DocMemory] Creating new Task SOP for ${fileName}...`);
        docId = await service.createDocument(fileName, folder);
        await service.appendContent(docId, [
          { type: 'heading', level: 1, content: `🧠 ${fileName} 任务 SOP` },
          { type: 'paragraph', content: `原始任务目标: ${goal}` },
          { type: 'divider' },
        ]);
      }

      const blocks: DocBlock[] = wisdom.map(w => ({
        type: 'bullet' as const,
        content: `${w} (沉淀于 ${new Date().toLocaleDateString()})`,
      }));
      await service.appendContent(docId, blocks);
      console.log(`[DocMemory] Updated Task SOP for ${fileName} (${wisdom.length} wisdoms)`);
    } catch (error: any) {
      console.error(`[DocMemory] Failed to upsert Task SOP: ${error.message}`);
    }
  }
}
