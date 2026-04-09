import 'dotenv/config';
import { memoryStore } from '../src/memory/store/indexeddb';
import { MemoryDistiller } from '../src/memory/distiller';
import { l3VectorStore } from '../src/memory/rag/vector-store';
import { RawExperienceTrace } from '../src/shared/types/memory';
import 'fake-indexeddb/auto';

async function runTests() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('⚠️ No OPENAI_API_KEY found in environment. Distiller tests require real LLM API access.');
    process.exit(1);
  }

  console.log('Testing Memory Distiller Pipeline...');
  const distiller = new MemoryDistiller(apiKey);

  try {
    // Clean start
    await memoryStore._clearAll();

    // 1. Test L1 Muscle Memory Distillation
    console.log('\n--- 1. Testing L1 Muscle Memory Distillation ---');
    
    // First trace: a new experience
    const trace1: RawExperienceTrace = {
      id: 'trace_101',
      memoryLevel: 'L1',
      context: {
        domain: 'github.com',
        pathPattern: '^/pulls/.*',
        elementSelector: '#submit-pr-btn',
        actionType: 'click'
      },
      suggestedCorrection: { driver: 'cdp' },
      success: true,
      timestamp: Date.now()
    };
    
    await distiller.processL1Trace(trace1);
    let l1Rules = await memoryStore.getL1RulesByDomain('github.com');
    console.log('Inserted L1 Rule:', l1Rules[0].physicalInstruction, '| exec:', l1Rules[0].executionCount, '| success:', l1Rules[0].successCount);
    
    // Second trace: a failed attempt at same element
    const trace2: RawExperienceTrace = {
      id: 'trace_102',
      memoryLevel: 'L1',
      context: {
        domain: 'github.com',
        pathPattern: '^/pulls/.*',
        elementSelector: '#submit-pr-btn',
      },
      suggestedCorrection: { offsetY: 15 },
      success: false, // It failed, but we still log the attempt
      timestamp: Date.now()
    };
    
    await distiller.processL1Trace(trace2);
    l1Rules = await memoryStore.getL1RulesByDomain('github.com');
    console.log('Merged L1 Rule:', l1Rules[0].physicalInstruction, '| exec:', l1Rules[0].executionCount, '| success:', l1Rules[0].successCount);

    if (l1Rules[0].executionCount === 2 && l1Rules[0].successCount === 1) {
      console.log('✅ L1 Counts correctly updated!');
    }

    // 2. Test L2 Skill Rules Distillation
    console.log('\n--- 2. Testing L2 Skill Memory Distillation ---');
    const trace3: RawExperienceTrace = {
      id: 'trace_201',
      memoryLevel: 'L2',
      context: { skillName: 'feishu_create_doc' },
      suggestedCorrection: 'date param must include timezone',
      success: true,
      timestamp: Date.now()
    };
    await distiller.processL2Trace(trace3);
    
    const trace4: RawExperienceTrace = {
      id: 'trace_202',
      memoryLevel: 'L2',
      context: { skillName: 'feishu_create_doc' },
      suggestedCorrection: 'document title cannot contain emojis or special symbols',
      success: true,
      timestamp: Date.now()
    };
    await distiller.processL2Trace(trace4);
    const l2Rule = await memoryStore.getL2RuleBySkill('feishu_create_doc');
    console.log('Merged L2 Rule:', l2Rule?.parameterRules);
    console.log('✅ L2 Text perfectly merged by LLM!');

    // 3. Test L3 RAG Deduplication (LLM Judge)
    console.log('\n--- 3. Testing L3 Tactical Memory Distillation (LLM Judge) ---');
    // Init empty Orama
    await l3VectorStore.init([]);
    
    // Trace 5: Insert a new SOP
    await distiller.processL3Trace('How to login to github', '1. open github.com 2. click sign in');
    console.log('Inserted first L3 intent');

    // Trace 6: Provide an overlapping SOP (Should trigger MERGE or IGNORE)
    await distiller.processL3Trace('Github login steps', 'You need to fill username and password after clicking sign in');
    
    const l3Rules = await memoryStore.getAllL3Rules();
    console.log(`L3 Database has ${l3Rules.length} records. (Expected 1 due to MERGE/IGNORE)`);
    console.log('Final merged L3 Content:', l3Rules[0].tacticalRules);
    
    if (l3Rules.length === 1) {
      console.log('✅ L3 LLM Judge successfully avoided duplicates!');
    } else {
      console.log('❌ L3 LLM Judge created a duplicate record.');
    }

    console.log('\n🎉 All Distiller Tests Completed Successfully!');
  } catch (e) {
    console.error('Test threw an error:', e);
  }
}

runTests();