import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MemoryRelation } from "../../shared/types/memory";

export interface L3JudgeEdge {
  targetId: string;
  relation: MemoryRelation;
  weight: number;
}

export interface L3JudgeDecision {
  action: "IGNORE" | "MERGE" | "INSERT";
  targetId?: string;
  mergedContent?: string;
  /** Typed edges to create between the new/merged memory and similar existing ones. */
  edges: L3JudgeEdge[];
}

// Base LLM caller for Memory Distiller
export class DistillerLLM {
  private llm: ChatOpenAI;

  constructor(apiKey: string) {
    const baseUrl = process.env.VITE_LLM_BASE_URL || process.env.OPENAI_BASE_URL;
    const modelName = process.env.VITE_LLM_MODEL || "gpt-4o-mini";
    // We use gpt-4o-mini as it is fast, cheap, and very capable for simple JSON merging
    this.llm = new ChatOpenAI({
      apiKey: apiKey,
      modelName: modelName,
      temperature: 0.1, // Keep it deterministic
      configuration: baseUrl ? { baseURL: baseUrl } : undefined
    });
  }

  /**
   * LLM Judge for L1/L2: Merge old rules with new corrections
   */
  async mergeJSONRules(oldRules: string, newCorrection: string): Promise<string> {
    const prompt = `You are an expert in JSON and rule merging.
We have an old rule/parameter set:
${oldRules}

And a new correction/rule that must be applied:
${newCorrection}

Please merge them intelligently. If they are JSON, output valid JSON. If they are plain text rules, output a concise combined rule text.
Do not wrap your output in markdown blocks (\`\`\`). Just output the raw result.`;

    const response = await this.llm.invoke([
      new SystemMessage("You are a helpful assistant that strictly follows instructions."),
      new HumanMessage(prompt),
    ]);

    return response.content.toString().trim();
  }

  /**
   * LLM Judge for L3 RAG Deduplication + Knowledge Graph Edge Classification.
   *
   * In a single call the model decides IGNORE/MERGE/INSERT and also classifies the
   * semantic relationship between the new memory and each similar existing one.
   * This zero-overhead edge classification bootstraps the knowledge graph without
   * any additional LLM calls.
   */
  async judgeL3Trace(newIntent: string, newRules: string, historyDocs: any[]): Promise<L3JudgeDecision> {
    const historyText = historyDocs.map((doc, index) =>
      `[Doc ${index + 1}] ID: ${doc.id}\nTitle: ${doc.memoryTitle || ""}\nIntent: ${doc.intentQuery}\nTaskType: ${doc.taskType || ""}\nDomain: ${doc.domainScope || ""}\nRules: ${doc.tacticalRules}`
    ).join("\n\n");

    const prompt = `You are a Memory Distiller for an AI agent.
A new SOP (Standard Operating Procedure) has been generated:
New Intent: ${newIntent}
New Rules: ${newRules}

Here are the Top 5 most similar historical SOPs retrieved from the local BM25 search index:
${historyText || "No history found."}

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
}`;

    const response = await this.llm.invoke([
      new SystemMessage("You are a JSON-only response bot."),
      new HumanMessage(prompt),
    ]);

    try {
      let content = response.content.toString().trim();
      if (content.startsWith("```json")) {
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();
      }
      const parsed = JSON.parse(content) as L3JudgeDecision;
      // Ensure edges is always an array even if the model omits it.
      return { ...parsed, edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
    } catch (e) {
      console.error("Failed to parse LLM Judge response:", response.content);
      // Fallback to INSERT to avoid losing data; no edges on parse failure.
      return { action: "INSERT", mergedContent: newRules, edges: [] };
    }
  }
}
