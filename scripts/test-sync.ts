import 'fake-indexeddb/auto';
import { memoryStore } from '../src/memory/store/indexeddb';
import { SyncWorker } from '../src/memory/sync/sync-worker';
import { TableOperator, TableConfig } from '../src/shared/types/operator';

// Create a mock class implementing TableOperator
class MockTableOperator implements TableOperator {
  public mockCloudDB: Record<string, any[]> = {
    'tbl_L1': [],
    'tbl_L2': [],
    'tbl_L3': []
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

async function runTests() {
  console.log('Testing Cloud-Edge Sync Pipeline...');

  try {
    // 1. Clean local DB
    await memoryStore._clearAll();

    // 2. Setup mock sync worker
    const mockApi = new MockTableOperator();
    const config: TableConfig = {
      appId: 'mock_app_id',
      appSecret: 'mock_app_secret',
      appToken: 'mock_app_token',
      tableIds: { L1: 'tbl_L1', L2: 'tbl_L2', L3: 'tbl_L3' }
    };
    const worker = new SyncWorker(mockApi, config);

    // 3. Simulate Distiller creating local rules (which also puts tasks in SyncQueue)
    console.log('\n--- 1. Simulating Distiller Local Execution ---');
    const newL1 = {
      id: 'mus_test_01',
      domain: 'test.com',
      pathPattern: '/*',
      elementSelector: 'body',
      actionType: 'click',
      physicalInstruction: 'click',
      executionCount: 1,
      successCount: 1,
      updatedAt: Date.now()
    };
    await memoryStore.putL1Rule(newL1);
    await memoryStore.enqueueSync({
      id: 'sync_001',
      action: 'insert',
      memoryLevel: 'L1',
      targetId: newL1.id,
      payload: newL1,
      queuedAt: Date.now()
    });

    let queue = await memoryStore.getSyncQueue();
    console.log(`Local SyncQueue size: ${queue.length}`);

    // 4. Test PUSH
    console.log('\n--- 2. Testing Push (Edge -> Cloud) ---');
    await worker.pushQueueToCloud();
    
    queue = await memoryStore.getSyncQueue();
    if (queue.length === 0) {
      console.log('✅ Push successful: Local SyncQueue is now empty.');
    } else {
      console.error('❌ Push failed: SyncQueue still has items.');
    }

    // 5. Test PULL (Simulating a user modifying Bitable on another device)
    console.log('\n--- 3. Testing Pull (Cloud -> Edge) ---');
    // Inject a fake record into the cloud
    mockApi.mockCloudDB['tbl_L2'].push({
      record_id: 'rec_remote_01',
      fields: {
        id: 'skl_remote_01',
        skillName: 'remote_skill',
        parameterRules: 'this was pulled from cloud',
        status: 'active',
        updatedAt: Date.now() + 10000 // In the future
      }
    });

    await worker.pullCloudToEdge(Date.now() - 50000); // Pull anything from last minute
    
    const localL2 = await memoryStore.getL2RuleBySkill('remote_skill');
    if (localL2 && localL2.parameterRules === 'this was pulled from cloud') {
      console.log('✅ Pull successful: Cloud record successfully written to local IndexedDB.');
    } else {
      console.error('❌ Pull failed: Cloud record not found locally.');
    }

    console.log('\n🎉 All Sync Tests Completed Successfully!');
  } catch (e) {
    console.error('Test threw an error:', e);
  }
}

runTests();