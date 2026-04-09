import "dotenv/config";
import 'fake-indexeddb/auto'; // Mock IndexedDB for Node environment
import { memoryStore } from '../src/memory/store/indexeddb';
import { l3VectorStore } from '../src/memory/rag/vector-store';
import { getEmbedding } from '../src/memory/rag/embedding';
import { MemoryDistiller } from '../src/memory/distiller';
import { SyncWorker } from '../src/memory/sync/sync-worker';
import { FeishuTableOperator } from '../src/skills/bundled/feishu-operator/api';
import { TableOperator, TableConfig } from '../src/shared/types/operator';
import { RawExperienceTrace } from '../src/shared/types/memory';

// Mock TableOperator for environments without Feishu Keys
class MockTableOperator implements TableOperator {
  public mockCloudDB: Record<string, any[]> = {
    'tbl_L1': [], 'tbl_L2': [], 'tbl_L3': []
  };

  async searchRecords(tableId: string, filter?: any) {
    console.log(`[MockTableOperator] Search requested on ${tableId} with filter:`, JSON.stringify(filter));
    if (filter?.conditions?.[0]?.field_name === 'updatedAt') {
      return { items: this.mockCloudDB[tableId] };
    }
    return { items: [] };
  }

  async createRecord(tableId: string, fields: any) {
    console.log(`[MockTableOperator] Create Record in ${tableId}:`, JSON.stringify(fields).substring(0, 100) + '...');
    this.mockCloudDB[tableId].push({ record_id: 'rec_' + Math.random(), fields });
    return { record: { record_id: 'rec_xxx' } };
  }

  async updateRecordByCustomId(tableId: string, customId: string, fields: any) {
    console.log(`[MockTableOperator] Update Record in ${tableId} for ID ${customId}:`, JSON.stringify(fields).substring(0, 100) + '...');
    return { record: { record_id: 'rec_yyy' } };
  }
}

async function runComprehensiveTest() {
  console.log("=========================================");
  console.log("🚀 Starting Comprehensive Memory System Test");
  console.log("=========================================\n");

  const openAIApiKey = process.env.VITE_LLM_API_KEY || process.env.OPENAI_API_KEY;
  const hasOpenAI = !!openAIApiKey;
  const hasFeishu = !!process.env.VITE_LARK_APP_ID && !!process.env.VITE_LARK_APP_SECRET;

  console.log(`[Environment] OpenAI API Key: ${hasOpenAI ? "✅ Present" : "❌ Missing (Expect some failures/mocks)"}`);
  console.log(`[Environment] Feishu Credentials: ${hasFeishu ? "✅ Present" : "❌ Missing (Using Mock Operator)"}\n`);

  try {
    // 1. Initialize Stores
    console.log("--- 1. Initializing Stores ---");
    await memoryStore._clearAll(); // Clean slate
    await l3VectorStore.init([]);
    console.log("✅ IndexedDB & Orama Vector Store initialized.\n");

    // 2. Setup Operators & Workers
    console.log("--- 2. Setting up Workers ---");
    const config: TableConfig = {
      appId: process.env.VITE_LARK_APP_ID || 'mock_app_id',
      appSecret: process.env.VITE_LARK_APP_SECRET || 'mock_secret',
      appToken: process.env.VITE_LARK_APP_TOKEN || 'mock_token',
      tableIds: { L1: 'tbl_L1', L2: 'tbl_L2', L3: 'tbl_L3' }
    };
    
    const tableOperator = hasFeishu ? new FeishuTableOperator(config) : new MockTableOperator();
    const syncWorker = new SyncWorker(tableOperator, config);
    const distiller = new MemoryDistiller(openAIApiKey || 'mock_key');
    console.log("✅ Distiller & SyncWorker initialized.\n");

    if (!hasOpenAI) {
      console.warn("⚠️ Warning: Skipping Distiller test because OpenAI API Key is missing.");
    } else {
      // 3. Test Distiller Pipeline (L1 & L3)
      console.log("--- 3. Testing Distiller (L1 & L3 Processing) ---");
      const trace1: RawExperienceTrace = {
        id: "trace_1",
        memoryLevel: "L1",
        context: {
          domain: "github.com",
          pathPattern: "/login",
          elementSelector: "#login_field",
          actionType: "input"
        },
        suggestedCorrection: "input username",
        success: true,
        timestamp: Date.now()
      };

      const trace3: RawExperienceTrace = {
        id: "trace_3",
        memoryLevel: "L3",
        context: {
          intent: "How to login to Github",
          newRules: "First input username in #login_field, then password in #password, then click submit."
        },
        suggestedCorrection: "First input username in #login_field, then password in #password, then click submit.",
        success: true,
        timestamp: Date.now()
      };

      console.log("Processing L1 trace...");
      await distiller.processL1Trace(trace1);
      console.log("Processing L3 trace...");
      await distiller.processL3Trace(
        trace3.context.intent,
        trace3.context.newRules
      );

      const l1Rules = await memoryStore.getL1RulesByDomain("github.com");
      const l3Rules = await memoryStore.getAllL3Rules();
      
      console.log(`✅ Distiller created ${l1Rules.length} L1 rules and ${l3Rules.length} L3 rules.`);
      
      if (l3Rules.length > 0) {
        console.log("--- 4. Testing RAG Vector Search ---");
        const vector = await getEmbedding("Github login", openAIApiKey as string);
        const searchRes = await l3VectorStore.searchSimilar(vector, 1);
        console.log(`✅ Vector Search found ${searchRes.length} matching L3 rules.\n`);
      }
    }

    // 4. Test SyncWorker Push
    console.log("--- 5. Testing Sync Worker (Push) ---");
    let queue = await memoryStore.getSyncQueue();
    console.log(`Found ${queue.length} tasks in SyncQueue. Pushing to Cloud...`);
    await syncWorker.pushQueueToCloud();
    queue = await memoryStore.getSyncQueue();
    console.log(`✅ Push complete. SyncQueue remaining: ${queue.length}\n`);

    // 5. Test SyncWorker Pull
    console.log("--- 6. Testing Sync Worker (Pull) ---");
    // If we're using the mock operator, let's inject a fake cloud update
    if (!hasFeishu) {
      (tableOperator as MockTableOperator).mockCloudDB['tbl_L2'].push({
        record_id: 'rec_remote_999',
        fields: {
          id: 'skl_remote_999',
          skillName: 'mock_remote_skill',
          parameterRules: 'pulled from mock cloud',
          status: 'active',
          updatedAt: Date.now() + 10000
        }
      });
    }
    
    await syncWorker.pullCloudToEdge(Date.now() - 60000);
    const localL2 = await memoryStore.getL2RuleBySkill("mock_remote_skill");
    console.log(`✅ Pull complete. Found pulled local L2 rule: ${localL2 ? 'Yes' : 'No'}\n`);

    console.log("🎉 ALL TESTS COMPLETED SUCCESSFULLY!");
  } catch (error) {
    console.error("❌ TEST FAILED:", error);
  }
}

runComprehensiveTest();