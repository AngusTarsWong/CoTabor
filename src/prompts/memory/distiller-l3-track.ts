import type { PromptTemplate } from "../types";

export interface DistillerL3TrackPromptVars {
  newIntent: string;
  newRules: string;
  historyText: string;
}

/**
 * L3 deduplication + knowledge-graph edge classification.
 *
 * In a single call the model decides IGNORE/MERGE/INSERT and classifies the
 * semantic relationship between the new memory and each similar existing one.
 * This bootstraps the knowledge graph without additional LLM calls.
 */
export const distillerL3TrackPrompt: PromptTemplate<DistillerL3TrackPromptVars> = {
  system: "You are a JSON-only response bot.",

  user: (vars) => `You are a Memory Distiller for an AI agent.
A new SOP (Standard Operating Procedure) has been generated:
New Intent: ${vars.newIntent}
New Rules: ${vars.newRules}

Here are the Top 5 most similar historical SOPs retrieved from the local BM25 search index:
${vars.historyText || "No history found."}

## Task 1 — Action Decision
Analyze the historical SOPs against the new SOP. Decide on one of three actions:
1. IGNORE: The new SOP is completely redundant and already fully covered by one of the historical SOPs.
2. MERGE: The new SOP is about the same intent as a historical SOP, but contains new valuable steps or corrections. You must merge them into a single, comprehensive SOP.
3. INSERT: The new SOP is completely new and does not match any historical SOP's intent.

## Task 2 — Knowledge Graph Edges
For each historical SOP, classify its semantic relationship to the new SOP (or the merged result):
- "refines": The new SOP is a more precise/accurate version of the historical one (substitution).
- "extends": The new SOP adds new steps that the historical SOP doesn't cover (additive).
- "contradicts": The new SOP and the historical SOP give conflicting advice (dangerous pair).
- "co_occurs": The two SOPs are about different intents but are often useful together.
- "prerequisite": The historical SOP should be known before applying the new SOP.
- null: No meaningful relationship.

Only include edges where a clear relationship exists. Weight 0.5–0.9 (higher = stronger signal).

## Output
Respond strictly in JSON format:
{
  "action": "IGNORE" | "MERGE" | "INSERT",
  "targetId": "The ID of the historical doc to merge with (only if action is MERGE)",
  "mergedContent": "The fully merged SOP text (if MERGE) or the optimized new SOP text (if INSERT). Leave empty if IGNORE.",
  "edges": [
    { "targetId": "<doc_id>", "relation": "<relation>", "weight": 0.0 }
  ]
}`,
};
