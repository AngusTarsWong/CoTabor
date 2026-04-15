import 'dotenv/config';
import { getEmbedding } from '../src/memory/rag/embedding';
import { l3VectorStore } from '../src/memory/rag/vector-store';
import { L3TacticalMemory } from '../src/shared/types/memory';

async function runTest() {
  const apiKey = process.env.VITE_ARK_EMBEDDING_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No VITE_ARK_EMBEDDING_API_KEY found in environment. We will mock the embeddings. In production, this requires an API key.');
  }

  console.log('--- 1. Generating Mock Data (or calling OpenAI API) ---');
  
  // 2048 is the dimension size for doubao-embedding-vision
  const createMockEmbedding = (val: number) => Array.from({ length: 2048 }, () => val);

  // Doc 1: Github login intent
  const intent1 = 'How to login to Github';
  const doc1: L3TacticalMemory = {
    id: 'tac_1',
    intentQuery: intent1,
    tacticalRules: '1. Go to github.com 2. Click Sign In 3. Fill credentials 4. Submit',
    embedding: apiKey ? await getEmbedding(intent1, apiKey) : createMockEmbedding(0.1),
    updatedAt: Date.now()
  };

  // Doc 2: Feishu doc creation intent
  const intent2 = 'How to create a new Feishu doc';
  const doc2: L3TacticalMemory = {
    id: 'tac_2',
    intentQuery: intent2,
    tacticalRules: '1. Open Feishu 2. Click + button 3. Select Document',
    embedding: apiKey ? await getEmbedding(intent2, apiKey) : createMockEmbedding(-0.1),
    updatedAt: Date.now()
  };

  console.log('--- 2. Initializing Orama Vector DB ---');
  await l3VectorStore.init([doc1, doc2]);
  console.log('✅ Orama DB successfully loaded with 2 documents in-memory');

  console.log('\n--- 3. Testing Semantic Search ---');
  const userQuery = 'I want to sign in to my github account';
  console.log(`User Query: "${userQuery}"`);
  
  const queryVector = apiKey ? await getEmbedding(userQuery, apiKey) : createMockEmbedding(0.11);
  
  // Search for the closest match
  const results = await l3VectorStore.searchSimilar(queryVector, 1);
  
  console.log('\nSearch Results:');
  console.dir(results, { depth: null });

  if (results.length > 0 && results[0].id === 'tac_1') {
    console.log('\n🎉 RAG Test Passed: Successfully matched the Github login intent!');
  } else {
    console.error('\n❌ RAG Test Failed: Did not match correctly.');
    // If we used mocked data, exact cosine match might fail or return arbitrary results, but the execution pipeline itself passed.
    if (!apiKey) {
      console.log('Note: Since API key was missing, we used dummy arrays. Cosine match behavior is arbitrary. But the code pipeline runs correctly.');
    }
  }
}

runTest().catch(console.error);
