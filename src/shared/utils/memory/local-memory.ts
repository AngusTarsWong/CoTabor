import { IAgentMemory } from "../logger/interface";
import { memoryStore } from "../../../memory/store/indexeddb";
import { l3VectorStore } from "../../../memory/rag/vector-store";
import { getEmbedding } from "../../../memory/rag/embedding";
import { ENV } from "../../constants/env";

/**
 * Local IndexedDB Memory Provider.
 * This provider handles memory operations directly in the local browser IndexedDB,
 * ensuring the agent works perfectly even without Cloud (Lark/Notion) configuration.
 */
export class LocalMemoryProvider implements IAgentMemory {
  
  async upsertSiteMemory(domain: string, insights: string[]): Promise<void> {
    try {
      console.log(`[LocalMemory] Upserting ${insights.length} site memories for ${domain}...`);
      
      for (const insight of insights) {
        const l1Rule = {
          id: `mus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          domain,
          pathPattern: "*", // 默认全局适用，提炼模块可以更精细
          elementSelector: "local-insight", 
          actionType: "insight",
          physicalInstruction: insight,
          executionCount: 1,
          successCount: 1,
          updatedAt: Date.now()
        };
        await memoryStore.putL1Rule(l1Rule);
      }
      console.log(`[LocalMemory] Successfully saved site memory for ${domain}`);
    } catch (error: any) {
      console.error(`[LocalMemory] Failed to upsert site memory: ${error.message}`);
    }
  }

  async upsertTaskSOP(goal: string, wisdom: string[]): Promise<void> {
    try {
      console.log(`[LocalMemory] Upserting ${wisdom.length} task SOPs for goal: ${goal}...`);
      
      for (const w of wisdom) {
        // Fallback to empty embedding if the user doesn't have an embedding API configured
        let embedding: number[] = new Array(2048).fill(0);
        try {
          if (ENV.MIDSENSE_CONFIG && ENV.MIDSENSE_CONFIG.apiKey) {
            embedding = await getEmbedding(w);
          }
        } catch (e) {
          console.warn("[LocalMemory] Failed to generate embedding, saving without vectors:", e);
        }

        const l3Rule = {
          id: `tac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          intentQuery: goal,
          tacticalRules: w,
          embedding,
          executionCount: 1,
          successCount: 1,
          updatedAt: Date.now()
        };
        
        await l3VectorStore.addRecord(l3Rule);
      }
      console.log(`[LocalMemory] Successfully saved Task SOPs`);
    } catch (error: any) {
      console.error(`[LocalMemory] Failed to upsert Task SOP: ${error.message}`);
    }
  }
}
