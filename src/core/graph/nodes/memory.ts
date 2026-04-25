import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { skillRegistry } from "../../../skills/registry";
import { retrieveTaskMemories } from "../../../memory/retrieval/memory-retriever";
import { L1MuscleMemory } from "../../../shared/types/memory";
import { buildMemoryNodeUsage } from "../../../memory/retrieval/memory-usage-builder";

import { Skill } from "../../../skills/types";
import { invokeLLM } from "../../../shared/utils/llm-stream";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

export const memoryNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Memory Compressor & Initializer] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Memory] Stop requested. Skipping memory preparation.");
    return buildStoppedState(state);
  }

  // --- Skill Injection (Context Aware) ---
  const currentUrl = state.meta_data?.url;
  console.log(`[Memory] Refreshing skills for context URL: ${currentUrl || 'N/A'}`);
  
  // 确保即使云端鉴权失败，浏览器基础技能等依然可用
  let available_skills: Skill[] = [];
  try {
    available_skills = skillRegistry.getAvailableSkills({ url: currentUrl });
  } catch (e) {
    console.warn(`[Memory] Skill registry error (fallback to local skills only):`, e);
    // 这里可以通过 catch 保证哪怕崩溃，我们依然至少有一个空数组或者默认基础技能列表
  }
  
  console.log(`[Memory] Found ${available_skills.length} available skills.`);

  const { total_history, long_term_memory, request, task_run_id, task_type } = state;

  // --- RAG: Retrieve relevant memories from L1 / L2 / L3 ---
  let ragContext = "";
  let plannerMemoryContext = "";
  let replannerMemoryContext = "";
  let executorL1Hints: string[] = [];
  let retrievedL1Rules: L1MuscleMemory[] = [];
  let retrievedL2Rules: string[] = [];
  let retrievedL3Matches: import("../../../shared/types/memory").L3RetrievalMatch[] | undefined;
  try {
    const retrieval = await retrieveTaskMemories({
      request,
      currentUrl,
      skills: available_skills,
      taskRunId: task_run_id || undefined,
      taskType: task_type || undefined,
    });

    ragContext = retrieval.ragContext;
    plannerMemoryContext = retrieval.plannerMemoryContext;
    replannerMemoryContext = retrieval.replannerMemoryContext;
    executorL1Hints = retrieval.executorL1Hints;
    retrievedL1Rules = retrieval.l1Rules;
    retrievedL2Rules = retrieval.l2Rules;
    retrievedL3Matches = retrieval.l3Matches;
    if (retrieval.skillDescriptions.size > 0) {
      available_skills = available_skills.map((skill) => {
        const enrichedDescription = retrieval.skillDescriptions.get(skill.name);
        return enrichedDescription ? { ...skill, description: enrichedDescription } : skill;
      });
    }
  } catch (e) {
    console.warn("[Memory] Memory retrieval failed (non-critical):", e);
  }

  const threshold = 10; // 提高阈值，减少压缩频率，降低 Token 消耗
  const keepRecent = 3;

  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const offset = ltm.offset || 0;

  const uncompressedCount = total_history.length - offset;
  const availableToCompress = uncompressedCount - keepRecent;

  // Inject RAG context into LTM so planner always sees domain rules and past wisdom
  if (ragContext) {
    if (ragContext !== (ltm.rag_context || "")) {
      return {
        available_skills,
        long_term_memory: { ...ltm, rag_context: ragContext },
        retrieved_memories: {
          l1Prompt: plannerMemoryContext,
          l3Prompt: plannerMemoryContext,
          plannerContext: plannerMemoryContext,
          replannerContext: replannerMemoryContext,
          executorL1Hints,
          l1Rules: retrievedL1Rules,
          l2Rules: retrievedL2Rules,
          l3Matches: retrievedL3Matches,
        },
        node_memory_usage: buildMemoryNodeUsage({
          plannerContext: plannerMemoryContext,
          l2Rules: retrievedL2Rules,
        }),
      };
    }
  }

  if (availableToCompress < threshold) {
    return {
      available_skills,
      retrieved_memories: {
        l1Prompt: plannerMemoryContext,
        l3Prompt: plannerMemoryContext,
        plannerContext: plannerMemoryContext,
        replannerContext: replannerMemoryContext,
        executorL1Hints,
        l1Rules: retrievedL1Rules,
        l2Rules: retrievedL2Rules,
      },
      node_memory_usage: buildMemoryNodeUsage({
        plannerContext: plannerMemoryContext,
        l2Rules: retrievedL2Rules,
      }),
    };
  }

  console.log(`[Memory] Triggering compression. Uncompressed: ${uncompressedCount}, Target: ${availableToCompress}`);

  const endIndex = offset + availableToCompress;
  const toCompress = total_history.slice(offset, endIndex);

  // Build step descriptions for LLM
  // Prefer Watchdog's pre-generated step_summary; fall back to raw reconstruction
  const stepsText = toCompress.map(item => {
    if (item.step_summary) {
      return `Step ${item.step}: ${item.step_summary}`;
    }
    let actionDesc: string;
    if (item.action?.type === 'call_skill') {
      actionDesc = `call_skill(${item.action.skill_name}, ${JSON.stringify(item.action.params)})`;
    } else if (item.action?.type === 'memorize') {
      actionDesc = `memorize(${item.action.params?.key} = ${JSON.stringify(item.action.params?.value)})`;
    } else {
      actionDesc = item.action?.type || 'unknown';
    }
    const resultDesc = item.result?.success === false
      ? `FAILED: ${item.result?.error || item.result?.reason || 'unknown error'}`
      : 'SUCCESS';
    return `Step ${item.step}: ${actionDesc} → ${resultDesc}`;
  }).join('\n');

  let newSummaryChunk: string;
  let tokenUsage = { prompt: 0, completion: 0, total: 0 };

  try {
    const config = ENV.PLANNER_CONFIG;
    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      maxTokens: 500,
      timeout: 20000,
    });

    const existingContext = ltm.summary
      ? `Existing summary:\n${ltm.summary}\n\n`
      : '';

    const { content: memContent, tokenUsage: tu } = await invokeLLM(llm, [
      [ "system", `You are a memory summarization assistant for a browser automation agent.
Given a sequence of executed steps, write a concise summary (2-4 sentences) that captures:
- What was accomplished and what pages were visited
- Key data or information discovered (prices, names, IDs, URLs)
- Any failures and their likely cause
Write in past tense. Be specific. Preserve important values verbatim.` ],
      [ "human", `User Goal: ${request}\n\n${existingContext}New steps to summarize:\n${stepsText}\n\nWrite a concise summary of these steps that would help the agent recall what has been done so far.` ]
    ], 'memory', config.modelName);
    tokenUsage = tu;

    newSummaryChunk = (memContent || '').trim();
    console.log(`[Memory] LLM summary generated: ${newSummaryChunk}`);
  } catch (e) {
    // Fallback to simple summary if LLM call fails
    console.warn('[Memory] LLM compression failed, using fallback:', e);
    const compressedActions = toCompress.map(item => {
      if (item.action?.type === 'call_skill') return `[Skill: ${item.action.skill_name}]`;
      if (item.action?.type === 'memorize') return `[Memorize: ${item.action.params?.key}]`;
      return `[${item.action?.type}]`;
    }).join(' -> ');
    newSummaryChunk = `Executed: ${compressedActions}.`;
  }

  // Append new summary chunk to existing LTM
  const newSummary = ltm.summary
    ? `${ltm.summary}\n${newSummaryChunk}`
    : newSummaryChunk;

  console.log(`[Memory] Updated LTM summary (${newSummary.length} chars)`);

  return {
    long_term_memory: {
      ...ltm,
      summary: newSummary,
      offset: endIndex,
    },
    retrieved_memories: {
      l1Prompt: plannerMemoryContext,
      l3Prompt: plannerMemoryContext,
      plannerContext: plannerMemoryContext,
      replannerContext: replannerMemoryContext,
      executorL1Hints,
      l1Rules: retrievedL1Rules,
      l2Rules: retrievedL2Rules,
    },
    node_memory_usage: buildMemoryNodeUsage({
      plannerContext: plannerMemoryContext,
      l2Rules: retrievedL2Rules,
    }),
    available_skills,
    llm_payloads: [{
      node: 'memory',
      timestamp: Date.now(),
      payload: { model: ENV.PLANNER_CONFIG.modelName },
      response: newSummaryChunk,
      model: ENV.PLANNER_CONFIG.modelName,
      token_usage: tokenUsage
    }]
  };
};
