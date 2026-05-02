import type { PromptTemplate, SystemOnlyPrompt } from "../types";

export interface DistillerMergePromptVars {
  oldRules: string;
  newCorrection: string;
}

/**
 * L1/L2 rule merge: intelligently combines an existing rule set with a new correction.
 * Output is raw JSON or plain text — no markdown wrapping.
 */
export const distillerMergePrompt: PromptTemplate<DistillerMergePromptVars> = {
  system: "You are a helpful assistant that strictly follows instructions.",

  user: (vars) => `You are an expert in JSON and rule merging.
We have an old rule/parameter set:
${vars.oldRules}

And a new correction/rule that must be applied:
${vars.newCorrection}

Please merge them intelligently. If they are JSON, output valid JSON. If they are plain text rules, output a concise combined rule text.
Do not wrap your output in markdown blocks (\`\`\`). Just output the raw result.`,
};
