import 'fake-indexeddb/auto';
import { memoryStore } from '../src/memory/store/indexeddb';

async function runTests() {
  console.log('Testing IndexedDB Memory Store...');

  try {
    // Clean start
    await memoryStore._clearAll();

    // 1. Test L1 Muscle Memory
    console.log('\n--- Testing L1 Muscle Memory ---');
    const newL1Rule = {
      id: 'mus_1001',
      domain: 'github.com',
      pathPattern: '^/pulls/.*',
      elementSelector: '#login-btn',
      actionType: 'click',
      physicalInstruction: '{"driver":"cdp","offset":[10,10]}',
      executionCount: 1,
      successCount: 1,
      updatedAt: Date.now()
    };
    await memoryStore.putL1Rule(newL1Rule);
    console.log('Inserted L1 Rule');

    const fetchedL1 = await memoryStore.getL1RulesByDomain('github.com');
    console.log('Fetched L1 Rules by Domain:', fetchedL1);
    if (fetchedL1.length === 1 && fetchedL1[0].id === 'mus_1001') {
      console.log('✅ L1 Test Passed');
    } else {
      console.error('❌ L1 Test Failed');
    }

    // 2. Test L2 Skill Memory
    console.log('\n--- Testing L2 Skill Memory ---');
    const newL2Rule = {
      id: 'skl_2001',
      skillName: 'feishu_create_doc',
      parameterRules: 'date param must include timezone',
      status: 'active' as const,
      updatedAt: Date.now()
    };
    await memoryStore.putL2Rule(newL2Rule);
    
    const fetchedL2 = await memoryStore.getL2RuleBySkill('feishu_create_doc');
    console.log('Fetched L2 Rule by Skill:', fetchedL2);
    if (fetchedL2 && fetchedL2.id === 'skl_2001') {
      console.log('✅ L2 Test Passed');
    } else {
      console.error('❌ L2 Test Failed');
    }

    // 3. Test Sync Queue
    console.log('\n--- Testing Sync Queue ---');
    const syncEntry = {
      id: 'sync_101',
      action: 'insert' as const,
      memoryLevel: 'L1' as const,
      targetId: 'mus_1001',
      payload: newL1Rule,
      queuedAt: Date.now()
    };
    await memoryStore.enqueueSync(syncEntry);
    
    let queue = await memoryStore.getSyncQueue();
    console.log('Fetched Sync Queue:', queue);
    if (queue.length === 1 && queue[0].id === 'sync_101') {
      console.log('✅ Sync Queue Enqueue Passed');
    } else {
      console.error('❌ Sync Queue Enqueue Failed');
    }

    await memoryStore.clearSyncQueueEntry('sync_101');
    queue = await memoryStore.getSyncQueue();
    if (queue.length === 0) {
      console.log('✅ Sync Queue Clear Passed');
    } else {
      console.error('❌ Sync Queue Clear Failed');
    }

    console.log('\n🎉 All IndexedDB Tests Completed Successfully!');
  } catch (e) {
    console.error('Test threw an error:', e);
  }
}

runTests();