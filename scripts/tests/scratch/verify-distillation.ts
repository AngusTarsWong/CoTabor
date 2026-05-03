import 'dotenv/config';
import 'fake-indexeddb/auto';
import { ExperienceJobWorker } from '../../../src/memory/experience-job/worker';
import { memoryStore } from '../../../src/memory/store/indexeddb';
import { memoryProvider } from '../../../src/memory/store/memory-provider';
import { RawTraceRecord, TaskRunRecord, MemoryItem } from '../../../src/shared/types/memory';

async function testDistillation() {
  console.log('=== Distillation Verification Test ===');
  
  const taskRunId = 'test_run_123';
  const now = Date.now();
  
  // 1. Seed a TaskRun
  const taskRun: TaskRunRecord = {
    id: taskRunId,
    goal: 'Fetch news and save to Notion',
    status: 'FINISHED',
    startedAt: now - 10000,
    finishedAt: now,
    hostUrl: 'https://news.google.com',
    globalSummary: 'Successfully saved news to Notion.',
    traceCount: 2,
    candidateCount: 0,
    committedL1: 0,
    committedL2: 0,
    committedL3: 0,
    droppedCount: 0,
    localPersistStatus: 'saved',
    experienceStatus: 'PENDING',
    experienceRetryCount: 0,
    cloudSyncStatus: 'pending',
    updatedAt: now,
  };
  await memoryStore.putTaskRun(taskRun);
  
  // 2. Seed Raw Traces (Multi-agent: Browser + Notion)
  const traces: RawTraceRecord[] = [
    {
      traceId: 'trace_1',
      taskRunId,
      stepIndex: 1,
      timestamp: now - 5000,
      success: true,
      raw: {
        step: 1,
        action: { type: 'call_skill', skill_name: 'browser_navigate', params: { url: 'https://news.google.com' } },
        result: { success: true },
        step_summary: 'Navigated to Google News.'
      }
    },
    {
      traceId: 'trace_2',
      taskRunId,
      stepIndex: 2,
      timestamp: now - 1000,
      success: true,
      skillName: 'notion_operator',
      raw: {
        step: 2,
        action: { type: 'call_skill', skill_name: 'notion_operator', params: { instruction: 'Create page in "Research" folder' } },
        result: { success: true },
        step_summary: 'Created page in Notion using parent page reference.'
      }
    }
  ];
  await memoryStore.putRawTraces(traces);
  
  // 3. Run Worker
  console.log('Running ExperienceJobWorker...');
  const worker = new ExperienceJobWorker();
  const result = await worker.run(taskRunId);
  
  console.log('\nDistillation Result:');
  console.log(`  Candidates found: ${result.candidates}`);
  console.log(`  Committed: L1=${result.committed.L1}, L2=${result.committed.L2}, L3=${result.committed.L3}`);
  
  // 4. Verify in Database
  const items = await memoryProvider.search({ limit: 10 });
  console.log('\nVerified MemoryItems in DB:');
  items.forEach(item => {
    console.log(`- [${item.type}] ID: ${item.id}, Title: ${item.title}`);
  });
  
  if (items.length > 0) {
    console.log('\n✅ Distillation logic verified with new Unified Schema.');
  } else {
    console.log('\n❌ No memories were created.');
  }
}

testDistillation().catch(console.error);
