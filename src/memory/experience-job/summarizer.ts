import { ChatOpenAI } from "@langchain/openai";
import { invokeLLM } from "../../shared/utils/llm-stream";
import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { ENV } from "../../shared/constants/env";
import { TaskExperienceBuffer } from "../../shared/types/memory";
import { experienceSummarizerPrompt, resolveSystem } from "../../prompts";
import { getLlmClientHeaders } from "../../shared/utils/llm-headers";

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
  const promptVars = { isFailed, failureInsightInstruction, failureInsightSchema, langInstruction, ltmSummary: ltmSummary || "", trajectoryLog };
  const systemPrompt = resolveSystem(experienceSummarizerPrompt, promptVars);
  const userPrompt = experienceSummarizerPrompt.user(promptVars);

  const config = ENV.PLANNER_CONFIG;
  const llm = new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: { 
      baseURL: config.baseUrl,
      defaultHeaders: getLlmClientHeaders()
    },
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
