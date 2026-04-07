import { ChatOpenAI } from "@langchain/openai";
import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { skillRegistry } from "../../../skills/registry";

export const memoryNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Memory Compressor & Initializer] ---");

  // --- Skill Injection (Context Aware) ---
  const currentUrl = state.meta_data?.url;
  console.log(`[Memory] Refreshing skills for context URL: ${currentUrl || 'N/A'}`);
  const available_skills = skillRegistry.getAvailableSkills({ url: currentUrl });
  console.log(`[Memory] Found ${available_skills.length} available skills.`);

  const { total_history, long_term_memory, request } = state;
  const threshold = 3;
  const keepRecent = 1;

  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const offset = ltm.offset || 0;

  const uncompressedCount = total_history.length - offset;
  const availableToCompress = uncompressedCount - keepRecent;

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
