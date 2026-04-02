import { IAgentMemory } from "../logger/interface";
import { ENV } from "../../constants/env";
import { getLarkToken, findFileInFolder, createDocument, appendBlocks } from "../lark-utils";

export class LarkMemoryProvider implements IAgentMemory {
  
  async upsertSiteMemory(domain: string, insights: string[]): Promise<void> {
    const folderId = ENV.LARK_SITES_FOLDER;
    if (!folderId) return;

    try {
      const token = await getLarkToken(ENV.LARK_APP_ID, ENV.LARK_APP_SECRET);
      
      // 1. 查找现有文档 (文件名即域名)
      let docId = await findFileInFolder(token, folderId, domain);
      
      if (!docId) {
        console.log(`[LarkMemory] Creating new site memory for ${domain}...`);
        docId = await createDocument(token, folderId, domain);
        // 初始化标题
        await appendBlocks(token, docId, [
          { block_type: 3, heading1: { elements: [{ text_run: { content: `🌐 ${domain} 网站经验地图`, text_element_style: { bold: true } } }] } },
          { block_type: 22, divider: {} }
        ]);
      }

      // 2. 追加新经验
      const blocks = insights.map(insight => ({
        block_type: 12,
        bullet: { elements: [{ text_run: { content: `${insight} (发现于 ${new Date().toLocaleDateString()})` } }] }
      }));
      
      await appendBlocks(token, docId, blocks);
      console.log(`[LarkMemory] Updated site memory for ${domain} (${insights.length} insights)`);
    } catch (error: any) {
      console.error(`[LarkMemory] Failed to upsert site memory: ${error.message}`);
    }
  }

  async upsertTaskSOP(goal: string, wisdom: string[]): Promise<void> {
    const folderId = ENV.LARK_TASKS_FOLDER;
    if (!folderId) return;

    // 清理文件名 (去除特殊字符)
    const fileName = goal.substring(0, 50).replace(/[\\/:*?"<>|]/g, '_');

    try {
      const token = await getLarkToken(ENV.LARK_APP_ID, ENV.LARK_APP_SECRET);
      
      let docId = await findFileInFolder(token, folderId, fileName);
      
      if (!docId) {
        console.log(`[LarkMemory] Creating new Task SOP for ${fileName}...`);
        docId = await createDocument(token, folderId, fileName);
        await appendBlocks(token, docId, [
          { block_type: 3, heading1: { elements: [{ text_run: { content: `🧠 ${fileName} 任务 SOP`, text_element_style: { bold: true } } }] } },
          { block_type: 2, text: { elements: [{ text_run: { content: `原始任务目标: ${goal}` } }] } },
          { block_type: 22, divider: {} }
        ]);
      }

      const blocks = wisdom.map(w => ({
        block_type: 12,
        bullet: { elements: [{ text_run: { content: `${w} (沉淀于 ${new Date().toLocaleDateString()})` } }] }
      }));
      
      await appendBlocks(token, docId, blocks);
      console.log(`[LarkMemory] Updated Task SOP for ${fileName} (${wisdom.length} wisdoms)`);
    } catch (error: any) {
      console.error(`[LarkMemory] Failed to upsert Task SOP: ${error.message}`);
    }
  }
}
