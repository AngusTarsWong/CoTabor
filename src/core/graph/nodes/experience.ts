import { AgentState } from "../state";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { summarizeTaskExperience } from "../../../memory/experience-job/summarizer";

export const experienceNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Global Reflection (Experience)] ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Experience] Stop requested. Skipping final reflection.");
    return buildStoppedState(state);
  }

  const { total_history, status, long_term_memory } = state;

  if (!total_history || total_history.length === 0) {
    return {};
  }

  try {
    const summary = await summarizeTaskExperience({
      total_history,
      status,
      long_term_memory,
    });

    if (summary.globalSummary) {
      console.log(`[Global Reflection] Final Summary: ${summary.globalSummary}`);
    }
    if (summary.experienceBuffer) {
      console.log(`[Global Reflection] Distilled wisdom:`, summary.experienceBuffer);
    } else {
      console.log(`[Global Reflection] No significant wisdom extracted.`);
    }

    return {
      llm_payloads: summary.llmPayloads,
      experience_buffer: summary.experienceBuffer,
      error: status === "FAILED" ? summary.globalSummary || null : null,
    };
  } catch (e) {
    console.error("[Global Reflection] Extraction failed:", e);
    return {};
  }
};
