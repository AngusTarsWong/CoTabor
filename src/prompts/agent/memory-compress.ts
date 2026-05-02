import type { PromptTemplate } from "../types";

export interface MemoryCompressPromptVars {
  request: string;
  existingContext: string;
  stepsText: string;
}

/**
 * Compresses a batch of recent execution steps into a short LTM summary.
 * Written in English so the output is model-agnostic.
 */
export const memoryCompressPrompt: PromptTemplate<MemoryCompressPromptVars> = {
  system: `You are a memory summarization assistant for a browser automation agent.
Given a sequence of executed steps, write a concise summary (2-4 sentences) that captures:
- What was accomplished and what pages were visited
- Key data or information discovered (prices, names, IDs, URLs)
- Any failures and their likely cause
Write in past tense. Be specific. Preserve important values verbatim.`,

  user: (vars) =>
    `User Goal: ${vars.request}\n\n${vars.existingContext}New steps to summarize:\n${vars.stepsText}\n\nWrite a concise summary of these steps that would help the agent recall what has been done so far.`,
};
