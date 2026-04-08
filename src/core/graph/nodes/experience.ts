import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";

export const experienceNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Global Reflection (Experience)] ---");

  const { total_history, status } = state;

  if (!total_history || total_history.length === 0) {
    return {};
  }

  const isFailed = status === "FAILED";

  // Build a concise trajectory log from history
  const trajectoryLog = total_history.map((step, index) => {
    const actionDesc = step.action?.intent || step.action?.description || step.action?.type || "Unknown action";
    const resultSummary = step.step_summary || "No summary";
    return `Step ${index + 1}: [${actionDesc}] -> ${resultSummary}`;
  }).join("\n");

  try {
    const systemPrompt = `你是一个高级 AI 复盘专家（Global Reflection Agent）。
当前任务已经结束（${isFailed ? '失败' : '成功'}）。你的任务是根据整个执行流水账，提取全局的高价值经验。
请不要关注具体的数据抓取细节（如文章标题是什么），而是关注【操作方法论】。

提取目标：
1. **site_insight (站点技巧)**: 针对被操作的网站/工具，有什么值得记录的底层特性？（如："xx网站搜索框只能用xpath定位"，"飞书API调用需要等待3秒"等）。如果没有，留空。
2. **task_wisdom (任务智慧)**: 针对这类宏观任务，未来在流程规划上有什么“避坑指南”或优化建议？如果没有，留空。

输出严格的 JSON 格式：
{
  "site_insight": string | null,
  "task_wisdom": string | null
}`;

    const userPrompt = `
最终任务状态: ${isFailed ? "彻底失败 (FAILED) - 请重点总结为何会失败，应该如何避坑" : "成功完成 (FINISHED) - 请总结成功经验"}

全局执行流水账 (Trajectory):
---
${trajectoryLog}
---

请提取高价值经验（无价值则留空）。仅输出 JSON。`;

    const config = ENV.PLANNER_CONFIG;
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      maxTokens: 500,
      maxRetries: 1,
      timeout: 30000,
    });

    const completion = await llm.invoke([
      ["system", systemPrompt],
      ["human", userPrompt]
    ]);

    const content = completion.content as string;
    let distillation: { 
      site_insight?: string | null;
      task_wisdom?: string | null;
    };
    
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('\`\`\`json')) {
      cleanContent = cleanContent.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    }
    try {
      distillation = JSON.parse(cleanContent);
    } catch {
      distillation = {};
    }

    const returnPayload: Partial<AgentState> = {};
    const insights: any = { site_insights: [], task_wisdom: [] };
    
    // Attempt to extract the last known domain
    const lastStep = total_history[total_history.length - 1];
    let currentDomain = "unknown";
    try {
      if (lastStep?.meta?.url) {
        currentDomain = new URL(lastStep.meta.url).hostname;
      }
    } catch (e) {}
    
    if (distillation.site_insight) {
      insights.site_insights.push({ domain: currentDomain, content: distillation.site_insight });
    }
    if (distillation.task_wisdom) {
      insights.task_wisdom.push(distillation.task_wisdom);
    }

    if (insights.site_insights.length > 0 || insights.task_wisdom.length > 0) {
      console.log(`[Global Reflection] Distilled wisdom:`, insights);
      returnPayload.experience_buffer = insights;
    } else {
      console.log(`[Global Reflection] No significant wisdom extracted.`);
    }

    return returnPayload;
  } catch (e) {
    console.error("[Global Reflection] Extraction failed:", e);
    return {};
  }
};
