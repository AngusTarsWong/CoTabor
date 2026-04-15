import 'dotenv/config';
import { feishuOperatorSkill } from '../src/skills/bundled/feishu-operator/index';

async function run() {
  console.log('==========================================');
  console.log('🚀 CoTabor - 独立飞书 MCP Skill 测试');
  console.log('==========================================\n');

  console.log('⏳ 正在唤起 Feishu Operator 子代理...');

  try {
    const result = await feishuOperatorSkill.execute({
      instruction: "创建一个飞书文档，标题为「API直接测试文档」，内容为「这是通过纯后端 MCP 调用的测试文本。」，必须在返回结果中包含完整的飞书文档链接。"
    });
    
    console.log('\n==========================================');
    console.log('🏆 技能执行结果：');
    console.log(JSON.stringify(result, null, 2));
    console.log('==========================================\n');

  } catch (err) {
    console.error('❌ 执行失败:', err);
  }
}

run().catch(console.error);
