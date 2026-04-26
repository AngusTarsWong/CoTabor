import { ChatOpenAI } from "@langchain/openai";
import { invokeLLM } from "../../shared/utils/llm-stream";
import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { ENV } from "../../shared/constants/env";
import { TaskExperienceBuffer } from "../../shared/types/memory";

export interface ExperienceSummaryInput {
  total_history?: any[];
  status?: string;
  long_term_memory?: { summary?: string };
}

export interface ExperienceSummaryResult {
  globalSummary?: string;
  experienceBuffer?: TaskExperienceBuffer;
  llmPayloads: any[];
}

export async function summarizeTaskExperience(
  input: ExperienceSummaryInput
): Promise<ExperienceSummaryResult> {
  const { total_history, status, long_term_memory } = input;

  if (!total_history || total_history.length === 0) {
    return { llmPayloads: [] };
  }

  const isFailed = status === "FAILED";
  const ltmSummary = long_term_memory?.summary?.trim();
  const recentHistory = total_history.slice(-20);
  const trajectoryLog = recentHistory
    .map((step, index) => {
      const actionDesc =
        step.action?.intent ||
        step.action?.description ||
        step.action?.type ||
        "Unknown action";
      const resultSummary = step.step_summary || "No summary";
      const skillName = step.action?.skill_name
        ? ` skill=${step.action.skill_name}`
        : "";
      return `Step ${index + 1}: [${actionDesc}${skillName}] -> ${resultSummary}`;
    })
    .join("\n");

  const failureInsightInstruction = isFailed
    ? `5. **failure_insights**: 仅失败任务填写。明确指出「不应该做什么」或「哪一步导致了失败」，用反向指令描述，例如「不要先…，应先…」。没有则返回空数组。`
    : "";

  const failureInsightSchema = isFailed
    ? `,\n  "failure_insights": string[]`
    : "";

  const langInstruction = await getAgentLangInstruction();
  const systemPrompt = `你是一个高级 AI 复盘专家（Global Reflection Agent）。
当前任务已经结束（${isFailed ? "失败" : "成功"}）。你的任务是根据整个执行流水账，提取全局的高价值经验，并对任务结果进行整体总结。

提取目标：
1. **global_summary**: 简要总结本次任务最终完成了什么，结果如何。如果失败，说明失败在了哪一步。(50字以内)
2. **site_insights**: 页面/站点操作层经验，关注 DOM 交互、点击、输入、等待、页面特性。没有则返回空数组。
3. **tool_insights**: skill / API / MCP 调用层经验，关注参数约束、调用顺序、接口坑点。没有则返回空数组。
4. **task_wisdom**: 任务策略层经验，关注 SOP、规划顺序、宏观避坑。没有则返回空数组。
${failureInsightInstruction}

输出严格的 JSON 格式：
{
  "global_summary": string,
  "site_insights": [{"domain": string, "content": string}],
  "tool_insights": [{"skillName": string, "content": string}],
  "task_wisdom": string[]${failureInsightSchema}
}${langInstruction}`;

  const userPrompt = `
最终任务状态: ${isFailed ? "彻底失败 (FAILED) - 请重点总结为何会失败，应该如何避坑" : "成功完成 (FINISHED) - 请总结成功经验"}

长期摘要 (Long Term Summary):
---
${ltmSummary || "无"}
---

最近关键执行流水账 (Recent Trajectory):
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

  const { content, tokenUsage } = await invokeLLM(
    llm,
    [
      ["system", systemPrompt],
      ["human", userPrompt],
    ],
    "experience_job",
    config.modelName,
    "background"
  );

  let cleanContent = (content || "{}").trim();
  if (cleanContent.startsWith("```json")) {
    cleanContent = cleanContent.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleanContent.startsWith("```")) {
    cleanContent = cleanContent.replace(/^```/, "").replace(/```$/, "").trim();
  }

  let distillation:
    | {
        global_summary?: string;
        site_insights?: Array<{ domain?: string; content?: string }>;
        tool_insights?: Array<{ skillName?: string; content?: string }>;
        task_wisdom?: string[];
        failure_insights?: string[];
      }
    | undefined;
  try {
    distillation = JSON.parse(cleanContent);
  } catch {
    distillation = {};
  }

  const llmPayloads = [
    {
      node: "experience_job",
      timestamp: Date.now(),
      payload: { model: config.modelName },
      response: content,
      model: config.modelName,
      token_usage: tokenUsage,
    },
  ];

  const lastStep = total_history[total_history.length - 1];
  let currentDomain = "unknown";
  try {
    if (lastStep?.meta?.url) {
      currentDomain = new URL(lastStep.meta.url).hostname;
    }
  } catch {
    // ignore invalid URL
  }

  const experienceBuffer: TaskExperienceBuffer = {
    site_insights: [],
    tool_insights: [],
    task_wisdom: [],
  };

  (distillation?.site_insights || []).forEach((item) => {
    if (item?.content?.trim()) {
      experienceBuffer.site_insights.push({
        domain: item.domain || currentDomain,
        content: item.content.trim(),
      });
    }
  });

  (distillation?.tool_insights || []).forEach((item) => {
    if (item?.skillName?.trim() && item?.content?.trim()) {
      experienceBuffer.tool_insights.push({
        skillName: item.skillName.trim(),
        content: item.content.trim(),
      });
    }
  });

  (distillation?.task_wisdom || []).forEach((item) => {
    if (item?.trim()) {
      experienceBuffer.task_wisdom.push(item.trim());
    }
  });

  // failure_insights: only populated for failed tasks
  if (isFailed) {
    (distillation?.failure_insights || []).forEach((item) => {
      if (item?.trim()) {
        experienceBuffer.failure_insights = experienceBuffer.failure_insights ?? [];
        experienceBuffer.failure_insights.push(item.trim());
      }
    });
  }

  return {
    globalSummary: distillation?.global_summary?.trim() || "",
    experienceBuffer:
      experienceBuffer.site_insights.length > 0 ||
      experienceBuffer.tool_insights.length > 0 ||
      experienceBuffer.task_wisdom.length > 0
        ? experienceBuffer
        : undefined,
    llmPayloads,
  };
}
