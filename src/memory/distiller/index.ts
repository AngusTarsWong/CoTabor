import { memoryStore } from "../store/indexeddb";
import { l3Bm25Index } from "../retrieval/l3-bm25-index";
import { buildL3Keywords, inferL3Language } from "../retrieval/l3-query-preprocessor";
import { DistillerLLM } from "./llm";
import { ClassifiedMemory, RawExperienceTrace, L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from "../../shared/types/memory";

export class MemoryDistiller {
  private llm: DistillerLLM;
  private apiKey: string;

  constructor(openAIApiKey: string) {
    this.apiKey = openAIApiKey;
    this.llm = new DistillerLLM(openAIApiKey);
  }

  // Generate unique IDs for new memories
  private generateId(prefix: "mus" | "skl" | "tac"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Process L1 (Muscle Memory) - Precise URL matching + execution count tracking
   */
  async processL1Trace(trace: RawExperienceTrace): Promise<void> {
    if (trace.memoryLevel !== "L1") throw new Error("Expected L1 Trace");
    
    const domain = trace.context.domain;
    const pathPattern = trace.context.pathPattern;
    const selector = trace.context.elementSelector;

    // 1. O(1) Local lookup by domain
    const existingRules = await memoryStore.getL1RulesByDomain(domain);
    const match = existingRules.find(r => r.pathPattern === pathPattern && r.elementSelector === selector);

    let updatedRule: L1MuscleMemory;

    if (match) {
      // 2. Exact logic for counts (Deterministic)
      const newExecCount = match.executionCount + 1;
      const newSuccessCount = trace.success ? match.successCount + 1 : match.successCount;

      // 3. LLM Logic for text merging (Non-Deterministic)
      const mergedInstruction = await this.llm.mergeJSONRules(
        match.physicalInstruction,
        typeof trace.suggestedCorrection === "string" ? trace.suggestedCorrection : JSON.stringify(trace.suggestedCorrection)
      );

      updatedRule = {
        ...match,
        physicalInstruction: mergedInstruction,
        executionCount: newExecCount,
        successCount: newSuccessCount,
        updatedAt: Date.now(),
      };
      
      // Update IndexedDB
      await memoryStore.putL1Rule(updatedRule);
      // Queue for Feishu sync
      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "update",
        memoryLevel: "L1",
        targetId: updatedRule.id,
        payload: updatedRule,
        queuedAt: Date.now()
      });
    } else {
      // 4. Insert new rule
      updatedRule = {
        id: this.generateId("mus"),
        domain,
        pathPattern,
        elementSelector: selector,
        actionType: trace.context.actionType || "unknown",
        physicalInstruction: typeof trace.suggestedCorrection === "string" ? trace.suggestedCorrection : JSON.stringify(trace.suggestedCorrection),
        executionCount: 1,
        successCount: trace.success ? 1 : 0,
        updatedAt: Date.now()
      };

      await memoryStore.putL1Rule(updatedRule);
      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "insert",
        memoryLevel: "L1",
        targetId: updatedRule.id,
        payload: updatedRule,
        queuedAt: Date.now()
      });
    }
  }

  /**
   * Process L2 (Skill Rules) - Precise skillName matching
   */
  async processL2Trace(trace: RawExperienceTrace): Promise<void> {
    if (trace.memoryLevel !== "L2") throw new Error("Expected L2 Trace");
    
    const skillName = trace.context.skillName;
    const match = await memoryStore.getL2RuleBySkill(skillName);

    let updatedRule: L2SkillMemory;

    if (match) {
      const mergedRules = await this.llm.mergeJSONRules(
        match.parameterRules,
        typeof trace.suggestedCorrection === "string" ? trace.suggestedCorrection : JSON.stringify(trace.suggestedCorrection)
      );

      updatedRule = {
        ...match,
        parameterRules: mergedRules,
        updatedAt: Date.now(),
      };
      
      await memoryStore.putL2Rule(updatedRule);
      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "update",
        memoryLevel: "L2",
        targetId: updatedRule.id,
        payload: updatedRule,
        queuedAt: Date.now()
      });
    } else {
      updatedRule = {
        id: this.generateId("skl"),
        skillName,
        parameterRules: typeof trace.suggestedCorrection === "string" ? trace.suggestedCorrection : JSON.stringify(trace.suggestedCorrection),
        status: "active",
        updatedAt: Date.now()
      };

      await memoryStore.putL2Rule(updatedRule);
      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "insert",
        memoryLevel: "L2",
        targetId: updatedRule.id,
        payload: updatedRule,
        queuedAt: Date.now()
      });
    }
  }

  /**
   * Process L3 (Tactical SOP) - BM25 + LLM Judge Deduplication
   */
  async processL3Memory(goal: string, memory: ClassifiedMemory): Promise<void> {
    const intentQuery = memory.scope.taskType || goal;
    const newRules = memory.memoryText;
    const title = memory.title;
    const taskType = memory.scope.taskType;
    const domainScope = memory.domainScope || memory.scope.domain;
    const language = memory.language || inferL3Language({
      title,
      intentQuery,
      tacticalRules: newRules,
      domainScope,
      taskType,
      keywords: memory.keywords,
    });
    const keywords = buildL3Keywords({
      title,
      intentQuery,
      tacticalRules: newRules,
      domainScope,
      taskType,
      language,
      keywords: memory.keywords,
    });

    // 1. Fetch top similar SOPs from local BM25 index
    const similarDocs = await l3Bm25Index.search(`${title} ${intentQuery} ${newRules}`, {
      domainScope,
      taskType,
      language,
      limit: 5,
    });

    // 2. Ask LLM Judge to decide
    const judgeDecision = await this.llm.judgeL3Trace(intentQuery, newRules, similarDocs);

    if (judgeDecision.action === "IGNORE") {
      console.log(`[MemoryDistiller] L3 Trace Ignored (Redundant intent: ${intentQuery})`);
      return;
    }

    if (judgeDecision.action === "MERGE" && judgeDecision.targetId) {
      const targetDoc = similarDocs.find(d => d.id === judgeDecision.targetId);
      if (!targetDoc) throw new Error(`LLM returned invalid targetId: ${judgeDecision.targetId}`);

      const updatedRule: L3TacticalMemory = {
        ...targetDoc,
        title: title || targetDoc.title,
        taskType: taskType || targetDoc.taskType,
        domainScope: domainScope || targetDoc.domainScope,
        language: language || targetDoc.language,
        keywords: Array.from(new Set([...(targetDoc.keywords || []), ...keywords])),
        tacticalRules: judgeDecision.mergedContent || newRules,
        updatedAt: Date.now(),
        usageCount: targetDoc.usageCount || 0,
        successCount: targetDoc.successCount || 0,
      };

      // Write to IndexedDB
      await memoryStore.putL3Rule(updatedRule);
      await l3Bm25Index.rebuild();

      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "update",
        memoryLevel: "L3",
        targetId: updatedRule.id,
        payload: updatedRule,
        queuedAt: Date.now()
      });
      console.log(`[MemoryDistiller] L3 Trace Merged into ${judgeDecision.targetId}`);
    } else if (judgeDecision.action === "INSERT" || (judgeDecision.action === "MERGE" && !judgeDecision.targetId)) {
      const newRule: L3TacticalMemory = {
        id: this.generateId("tac"),
        intentQuery,
        title,
        taskType,
        domainScope,
        language,
        keywords,
        tacticalRules: judgeDecision.mergedContent || newRules,
        updatedAt: Date.now(),
        usageCount: 0,
        successCount: 0,
      };

      await memoryStore.putL3Rule(newRule);
      await l3Bm25Index.rebuild();

      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "insert",
        memoryLevel: "L3",
        targetId: newRule.id,
        payload: newRule,
        queuedAt: Date.now()
      });
      console.log(`[MemoryDistiller] L3 Trace Inserted as new SOP`);
    }
  }
}
