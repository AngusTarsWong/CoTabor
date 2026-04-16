import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { skillRegistry } from "../../../skills/registry";
import { memoryStore } from "../../../memory/store/indexeddb";
import { l3VectorStore } from "../../../memory/rag/vector-store";
import { getEmbedding } from "../../../memory/rag/embedding";

import { Skill } from "../../../skills/types";

export const memoryNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Memory Compressor & Initializer] ---");

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

  const { total_history, long_term_memory, request } = state;

  // --- RAG: Retrieve relevant memories from L1 (domain rules) and L3 (tactical wisdom) ---
  const ragParts: string[] = [];
  try {
    const domain = currentUrl ? new URL(currentUrl).hostname : "";
    if (domain) {
      const l1Rules = await memoryStore.getL1RulesByDomain(domain);
      if (l1Rules.length > 0) {
        ragParts.push(`[Domain Rules for ${domain}]\n` + l1Rules.map(r => r.physicalInstruction).join('\n'));
      }
    }
  } catch (e) {
    console.warn('[Memory] L1 domain lookup failed:', e);
  }
  try {
    const queryVector = await getEmbedding(request);
    if (queryVector.length === 2048) {
      const l3Results = await l3VectorStore.searchSimilar(queryVector, 3);
      if (l3Results.length > 0) {
        ragParts.push(`[Past Tactical Wisdom]\n` + l3Results.map(r => r.tacticalRules).join('\n'));
      }
    }
  } catch (e) {
    console.warn('[Memory] L3 vector search failed (non-critical):', e);
  }

  const threshold = 10; // 提高阈值，减少压缩频率，降低 Token 消耗
  const keepRecent = 3;

  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const offset = ltm.offset || 0;

  const uncompressedCount = total_history.length - offset;
  const availableToCompress = uncompressedCount - keepRecent;

  // Inject RAG context into LTM so planner always sees domain rules and past wisdom
  if (ragParts.length > 0) {
    const ragContext = ragParts.join('\n\n');
    if (ragContext !== (ltm.rag_context || "")) {
      return {
        available_skills,
        long_term_memory: { ...ltm, rag_context: ragContext },
      };
    }
  }

  if (availableToCompress < threshold) {
    return { available_skills };
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

    const completion = await llm.invoke([
      [ "system", `You are a memory summarization assistant for a browser automation agent.
Given a sequence of executed steps, write a concise summary (2-4 sentences) that captures:
- What was accomplished and what pages were visited
- Key data or information discovered (prices, names, IDs, URLs)
- Any failures and their likely cause
Write in past tense. Be specific. Preserve important values verbatim.` ],
      [ "human", `User Goal: ${request}\n\n${existingContext}New steps to summarize:\n${stepsText}\n\nWrite a concise summary of these steps that would help the agent recall what has been done so far.` ]
    ]);

    newSummaryChunk = (completion.content as string || '').trim();
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
    available_skills,
  };
};
