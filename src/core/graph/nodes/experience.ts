import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { invokeLLM } from "../../../shared/utils/llm-stream";
import { memoryStore } from "../../../memory/store/indexeddb";
import { l3VectorStore } from "../../../memory/rag/vector-store";
import { getEmbedding } from "../../../memory/rag/embedding";
import { L3TacticalMemory } from "../../../shared/types/memory";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

export const experienceNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Global Reflection (Experience)] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Experience] Stop requested. Skipping final reflection.");
    return buildStoppedState(state);
  }

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
当前任务已经结束（${isFailed ? '失败' : '成功'}）。你的任务是根据整个执行流水账，提取全局的高价值经验，并对任务结果进行整体总结。

提取目标：
1. **global_summary (全局总结)**: 简要总结本次任务最终完成了什么，结果如何。如果是失败的，说明失败在了哪一步。(50字以内)
2. **site_insight (站点技巧)**: 针对被操作的网站/工具，有什么值得记录的底层特性？（如："xx网站搜索框只能用xpath定位"，"飞书API调用需要等待3秒"等）。如果没有，留空。
3. **task_wisdom (任务智慧)**: 针对这类宏观任务，未来在流程规划上有什么“避坑指南”或优化建议？如果没有，留空。

输出严格的 JSON 格式：
{
  "global_summary": string,
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

    const { content, tokenUsage } = await invokeLLM(llm, [
      ["system", systemPrompt],
      ["human", userPrompt]
    ], 'experience', config.modelName);
    let distillation: { 
      global_summary?: string;
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

    const returnPayload: Partial<AgentState> = {
      llm_payloads: [{
        node: 'experience',
        timestamp: Date.now(),
        payload: { model: config.modelName },
        response: content,
        model: config.modelName,
        token_usage: tokenUsage,
      }],
    };
    const insights: any = { site_insights: [], task_wisdom: [] };
    
    // Attempt to extract the last known domain
    const lastStep = total_history[total_history.length - 1];
    let currentDomain = "unknown";
    try {
      if (lastStep?.meta?.url) {
        currentDomain = new URL(lastStep.meta.url).hostname;
      }
    } catch (e) {}
    
    if (distillation.global_summary) {
      console.log(`[Global Reflection] Final Summary: ${distillation.global_summary}`);
      // 将全局总结挂在最后一步的日志上，或通过其他方式供外部获取
      returnPayload.error = isFailed ? distillation.global_summary : null;
    }

    if (distillation.site_insight) {
      insights.site_insights.push({ domain: currentDomain, content: distillation.site_insight });
    }
    if (distillation.task_wisdom) {
      insights.task_wisdom.push(distillation.task_wisdom);
    }

    if (insights.site_insights.length > 0 || insights.task_wisdom.length > 0) {
      console.log(`[Global Reflection] Distilled wisdom:`, insights);
      returnPayload.experience_buffer = insights;

      // Persist to L3 IndexedDB so future runs can retrieve this wisdom via RAG
      const wisdomEntries: string[] = [
        ...insights.task_wisdom,
        ...insights.site_insights.map((s: { domain: string; content: string }) => `[${s.domain}] ${s.content}`),
      ];
      for (const wisdomText of wisdomEntries) {
        try {
          const embedding = await getEmbedding(wisdomText);
          const record: L3TacticalMemory = {
            id: `tac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            intentQuery: state.request,
            tacticalRules: wisdomText,
            embedding: embedding.length === 2048 ? embedding : undefined,
            updatedAt: Date.now(),
          };
          await memoryStore.putL3Rule(record);
          if (record.embedding) {
            await l3VectorStore.addRecord(record);
          }
          await memoryStore.enqueueSync({
            id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            action: "insert",
            memoryLevel: "L3",
            targetId: record.id,
            payload: record,
            queuedAt: Date.now(),
          });
          console.log(`[Global Reflection] Persisted L3 wisdom: ${wisdomText.slice(0, 60)}...`);
        } catch (e) {
          console.warn(`[Global Reflection] Failed to persist wisdom to L3 (non-critical):`, e);
        }
      }
    } else {
      console.log(`[Global Reflection] No significant wisdom extracted.`);
    }

    return returnPayload;
  } catch (e) {
    console.error("[Global Reflection] Extraction failed:", e);
    return {};
  }
};
