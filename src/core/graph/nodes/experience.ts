import OpenAI from "openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";

export const experienceNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Experience (Secretary)] ---");

  const { total_history, meta_data, watchdog_output } = state;

  if (total_history.length === 0) {
    return {};
  }

  // 如果审计失败，且不是因为内容问题（比如是技术失败），我们可能跳过经验提取
  // 但用户建议“审计通过时”执行，我们遵循计划
  if (watchdog_output?.status !== "PASS") {
    console.log("[Experience] WatchDog failed, skipping experience extraction for this step.");
    return {};
  }

  const lastStep = total_history[total_history.length - 1];
  const action = lastStep.action;
  const result = lastStep.result;
  const pageContent = meta_data?.page_content || "No page content available";

  try {
    const systemPrompt = `你是一个高级 AI 秘书（Experience Agent）。
你的任务是从刚刚完成的网页操作中提取有价值的结构化信息和长期经验。

任务目标：
1. **数据提取 (important_data)**: 提取页面中出现的关键事实数据（如：文章标题、作者、价格、ID、正文摘要等）。
2. **网站洞察 (site_insight)**: 记录关于当前域名的操作技巧（如：“搜索结果需要等待 2 秒加载”或“该站点的搜索按钮在输入框右侧”）。
3. **任务智慧 (task_wisdom)**: 总结对此类任务的通用建议。

输出严格的 JSON：
- "important_data": object — 提取的关键键值对。
- "site_insight": string | null — 站点技巧。
- "task_wisdom": string | null — 任务智慧。`;

    const userPrompt = `
上一步操作意图:
"${action?.intent || action?.description || "未知操作"}"

页面现状快照:
---
${pageContent.substring(0, 8000)} 
---

请提取数据和经验。仅输出 JSON。`;

    const config = ENV.PLANNER_CONFIG; // 使用强模型进行经验总结
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true,
    });

    const completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // 稍微增加一点创造性用于总结
      max_tokens: 1000
    } as any, { timeout: 30000 });

    const content = completion.choices[0].message.content;
    let distillation: { 
      important_data?: Record<string, any>;
      site_insight?: string | null;
      task_wisdom?: string | null;
    };
    
    let cleanContent = (content || "{}").trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    }
    try {
      distillation = JSON.parse(cleanContent);
    } catch {
      distillation = {};
    }

    const returnPayload: Partial<AgentState> = {};

    // 1. 写入 Notebook (数据)
    if (distillation.important_data && Object.keys(distillation.important_data).length > 0) {
      console.log(`[Experience] Extracted data:`, distillation.important_data);
      returnPayload.long_term_memory = {
        summary: state.long_term_memory?.summary || "",
        offset: state.long_term_memory?.offset || 0,
        notebook: distillation.important_data, // 注意：State Reducer 会负责合并
      };
    }

    // 2. 写入经验池
    const currentDomain = new URL(lastStep.meta?.url || 'http://unknown').hostname;
    const insights: any = { site_insights: [], task_wisdom: [] };
    
    if (distillation.site_insight) {
      insights.site_insights.push({ domain: currentDomain, content: distillation.site_insight });
    }
    if (distillation.task_wisdom) {
      insights.task_wisdom.push(distillation.task_wisdom);
    }

    if (insights.site_insights.length > 0 || insights.task_wisdom.length > 0) {
      console.log(`[Experience] Distilled wisdom:`, insights);
      returnPayload.experience_buffer = insights;
    }

    return returnPayload;
  } catch (e) {
    console.error("[Experience] Extraction failed:", e);
    return {};
  }
};
