import { PLANNER_PROMPT } from '../prompts';
import { PLANNER_MODEL_CONFIG } from '../config';
/**
 * Planner 节点
 * 职责：接收用户目标 (User Goal)，生成执行计划 (Plan)
 *
 * 目前这是一个 Mock 实现，后续会接入 LLM
 */
export const plannerNode = async (state) => {
    const messages = state.messages;
    const userGoal = messages[0]; // 假设第一条消息是用户目标
    console.log(`[Planner] Analyzing goal: ${userGoal}`);
    // 使用统一管理的模型配置
    console.log(`[Planner] Using model config: ${JSON.stringify(PLANNER_MODEL_CONFIG, null, 2)}`);
    // 使用统一管理的提示词模板
    // 简单替换一下模板变量，为了展示用法
    const prompt = PLANNER_PROMPT
        .replace('{userGoal}', userGoal)
        .replace('{history}', messages.slice(1).join('\n') || '无');
    console.log(`[Planner] Generated prompt (length: ${prompt.length})`);
    // 模拟：根据用户输入生成简单的计划
    // 在真实场景中，这里会调用 LLM (如 GPT-4) 进行任务拆解
    const mockPlan = [
        {
            id: 'step-1',
            description: `针对目标 "${userGoal}" 进行初步页面分析`,
            status: 'pending',
            reasoning: '首先需要了解当前页面结构'
        },
        {
            id: 'step-2',
            description: '执行相关操作',
            status: 'pending',
            reasoning: '根据分析结果执行具体动作'
        }
    ];
    return {
        plan: mockPlan,
        reasoning: `已将目标 "${userGoal}" 拆解为 ${mockPlan.length} 个步骤`
    };
};
