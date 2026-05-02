import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MemoryRelation } from "../../shared/types/memory";
import { distillerMergePrompt, distillerL3TrackPrompt, resolveSystem } from "../../prompts";

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
    const vars = { oldRules, newCorrection };
    const response = await this.llm.invoke([
      new SystemMessage(resolveSystem(distillerMergePrompt, vars)),
      new HumanMessage(distillerMergePrompt.user(vars)),
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

    const vars = { newIntent, newRules, historyText };
    const response = await this.llm.invoke([
      new SystemMessage(resolveSystem(distillerL3TrackPrompt, vars)),
      new HumanMessage(distillerL3TrackPrompt.user(vars)),
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
