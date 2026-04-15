import 'dotenv/config';
import { Client } from 'langsmith';

async function runTest() {
  console.log('==========================================');
  console.log(' 🚀 LangSmith 连通性测试脚本');
  console.log('==========================================');

  const apiKey = process.env.LANGCHAIN_API_KEY;
  const project = process.env.LANGCHAIN_PROJECT || 'default';
  const endpoint = process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';

  console.log(`- Endpoint: ${endpoint}`);
  console.log(`- Project : ${project}`);
  console.log(`- API Key : ${apiKey ? apiKey.substring(0, 8) + '***' : '⚠️ Missing Data'}`);
  console.log('------------------------------------------');

  try {
    console.log('⏳ 正在尝试向 LangSmith API 发送测试链路追踪数据...\n');
    
    const client = new Client();
    
    // 创建一个模拟的追踪节点 (Trace Run)
    const runId = crypto.randomUUID ? crypto.randomUUID() : (Math.random()*1000000).toFixed(0);
    
    await client.createRun({
      id: runId as string,
      name: 'Network-Test-Node',
      run_type: 'chain',
      inputs: { message: "Hello, this is a connectivity test from CoTabor" },
      project_name: project,
      start_time: Date.now()
    });

    // 几秒后结束这个模拟追踪
    await new Promise(resolve => setTimeout(resolve, 500));

    await client.updateRun(runId as string, {
      outputs: { status: "Success", details: "Network fetch succeeded." },
      end_time: Date.now(),
    });

    console.log('✅ 测试成功！数据已成功推送到 LangSmith。');
    console.log('🎉 现在去网页端刷新一下你的 Project 列表，应该就能看到这条名为 "Network-Test-Node" 的数据了。');
    
  } catch (error: any) {
    console.error('❌ 测试失败：无法连接到 LangSmith API。');
    console.error('详细报错信息：');
    console.error(error.message || error);
    
    if (error.message && error.message.includes('fetch failed')) {
      console.log('\n==========================================');
      console.log('⚠️ 诊断结论：这是典型的网络超时/被墙问题。');
      console.log('请尝试通过配置网络代理并在执行脚本前加上终端环境变量：');
      console.log('例如: https_proxy=http://127.0.0.1:7890 npx tsx scripts/test-langsmith.ts');
      console.log('如果 Node 版本较高(18+)，还需要加: NODE_OPTIONS="--experimental-global-custom-http-proxy"');
      console.log('==========================================');
    }
  }
}

runTest();
