import { AgentState } from "../state";
import { ENV } from "../../../shared/constants/env";
import { skillRegistry } from "../../../skills/registry";
import { retrieveTaskMemories } from "../../../memory/retrieval/memory-retriever";
import { MemoryItem } from "../../../shared/types/memory";
import { buildMemoryNodeUsage } from "../../../memory/retrieval/memory-usage-builder";
import { Skill } from "../../../skills/types";
import { invokeLLM } from "../../../shared/utils/llm-stream";
import { memoryCompressPrompt, resolveSystem } from "../../../prompts";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { log } from "../../../shared/utils/log";
import { createLlmClient, getLaneModelName } from "../../../shared/llm/provider";

export const memoryNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  log.info("--- [Node: Memory Compressor & Initializer] ---");

  if (shouldStopAtNodeEntry(state)) {
    log.info("[Memory] Stop requested. Skipping memory preparation.");
    return buildStoppedState(state);
  }

  // --- Skill Injection (Context Aware) ---
  const currentUrl = state.meta_data?.url;
  log.info(`[Memory] Refreshing skills for context URL: ${currentUrl || 'N/A'}`);
  
  // Keep local/browser-native skills available even if cloud-backed auth fails.
  let available_skills: Skill[] = [];
  try {
    available_skills = skillRegistry.getAvailableSkills({ url: currentUrl });
  } catch (e) {
    log.warn(`[Memory] Skill registry error (fallback to local skills only):`, e);
    // Keep the fallback skill list empty instead of failing the whole node.
  }
  
  log.info(`[Memory] Found ${available_skills.length} available skills.`);

  const { total_history, long_term_memory, request, task_run_id, task_type } = state;

  // --- RAG: Retrieve relevant memories from L1 / L2 / L3 ---
  let plannerMemoryContext = "";
  let replannerMemoryContext = "";
  let executorL1Hints: string[] = [];
  let retrievedL1Items: MemoryItem[] = [];
  let retrievedL3Items: MemoryItem[] = [];
  let retrievedAntiPatternL3Items: MemoryItem[] = [];
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

    plannerMemoryContext = retrieval.plannerMemoryContext;
    replannerMemoryContext = retrieval.replannerMemoryContext;
    executorL1Hints = retrieval.executorL1Hints;
    retrievedL1Items = retrieval.l1Items;
    retrievedL3Items = retrieval.l3Items;
    retrievedAntiPatternL3Items = retrieval.antiPatternL3Items;
    retrievedL2Rules = retrieval.l2Rules;
    retrievedL3Matches = retrieval.l3Matches;
    if (retrieval.skillDescriptions.size > 0) {
      available_skills = available_skills.map((skill) => {
        const enrichedDescription = retrieval.skillDescriptions.get(skill.name);
        return enrichedDescription ? { ...skill, description: enrichedDescription } : skill;
      });
    }
  } catch (e) {
    log.warn("[Memory] Memory retrieval failed (non-critical):", e);
  }

  const threshold = 10; // Higher threshold reduces compression frequency and token cost.
  const keepRecent = 3;

  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const offset = ltm.offset || 0;

  const uncompressedCount = total_history.length - offset;
  const availableToCompress = uncompressedCount - keepRecent;

  if (availableToCompress < threshold) {
    return {
      available_skills,
      retrieved_memories: {
        plannerContext: plannerMemoryContext,
        replannerContext: replannerMemoryContext,
        executorL1Hints,
        l1Items: retrievedL1Items,
        l3Items: retrievedL3Items,
        antiPatternL3Items: retrievedAntiPatternL3Items,
        l2Rules: retrievedL2Rules,
        l3Matches: retrievedL3Matches,
      },
      node_memory_usage: buildMemoryNodeUsage({
        plannerContext: plannerMemoryContext,
        l2Rules: retrievedL2Rules,
      }),
    };
  }

  log.info(`[Memory] Triggering compression. Uncompressed: ${uncompressedCount}, Target: ${availableToCompress}`);

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
  let memoryPromptPayload: Record<string, any> | null = null;

  try {
    const config = ENV.PLANNER_CONFIG;
    const llm = await createLlmClient("planner", "main", { temperature: 0.1, maxTokens: 500, timeout: 20000 });

    const existingContext = ltm.summary
      ? `Existing summary:\n${ltm.summary}\n\n`
      : '';

    const memPromptVars = { request, existingContext, stepsText };
    const systemPrompt = resolveSystem(memoryCompressPrompt, memPromptVars);
    const userPrompt = memoryCompressPrompt.user(memPromptVars);
    memoryPromptPayload = {
      model: getLaneModelName("planner"),
      systemPrompt,
      userPrompt,
      messages: [
        ["system", systemPrompt],
        ["human", userPrompt],
      ],
      input: {
        request,
        offset,
        endIndex,
        stepsText,
      },
    };
    const { content: memContent, tokenUsage: tu } = await invokeLLM(llm, [
      ["system", systemPrompt],
      ["human", userPrompt],
    ], 'memory', getLaneModelName("planner"), 'main', state.task_run_id);
    tokenUsage = tu;

    newSummaryChunk = (memContent || '').trim();
    log.info(`[Memory] LLM summary generated: ${newSummaryChunk}`);
  } catch (e) {
    // Fallback to simple summary if LLM call fails
    log.warn('[Memory] LLM compression failed, using fallback:', e);
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

  log.info(`[Memory] Updated LTM summary (${newSummary.length} chars)`);

  return {
    long_term_memory: {
      ...ltm,
      summary: newSummary,
      offset: endIndex,
    },
    retrieved_memories: {
      plannerContext: plannerMemoryContext,
      replannerContext: replannerMemoryContext,
      executorL1Hints,
      l1Items: retrievedL1Items,
      l3Items: retrievedL3Items,
      antiPatternL3Items: retrievedAntiPatternL3Items,
      l2Rules: retrievedL2Rules,
      l3Matches: retrievedL3Matches,
    },
    node_memory_usage: buildMemoryNodeUsage({
      plannerContext: plannerMemoryContext,
      l2Rules: retrievedL2Rules,
    }),
    available_skills,
    llm_payloads: [{
      node: 'memory',
      timestamp: Date.now(),
      payload: memoryPromptPayload || { model: ENV.PLANNER_CONFIG.modelName },
      response: newSummaryChunk,
      model: ENV.PLANNER_CONFIG.modelName,
      token_usage: tokenUsage
    }],
    node_llm_payloads: [{
      node: 'memory',
      timestamp: Date.now(),
      payload: memoryPromptPayload || { model: ENV.PLANNER_CONFIG.modelName },
      response: newSummaryChunk,
      model: ENV.PLANNER_CONFIG.modelName,
      token_usage: tokenUsage
    }]
  };
};
