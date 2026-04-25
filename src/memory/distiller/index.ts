import { memoryStore } from "../store/indexeddb";
import { l3Bm25Index } from "../retrieval/l3-bm25-index";
import { l3Embedder } from "../retrieval/embedder";
import { buildL3Keywords, inferL3Language } from "../retrieval/l3-query-preprocessor";
import { DistillerLLM, L3JudgeEdge } from "./llm";
import { ClassifiedMemory, MemoryEdge, MemoryRefRecord, RawExperienceTrace, L1MuscleMemory, L2SkillMemory, L3TacticalMemory } from "../../shared/types/memory";
import { growStability, initialStability } from "../retrieval/heat";

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
   * Persist knowledge-graph edges between `memoryId` and the similar docs identified
   * by the LLM judge.  Both directions are stored (A→B and B→A) so graph traversal
   * can find neighbours by either endpoint in O(1).
   * Called fire-and-forget — edge write failures must not break memory commit.
   */
  private async writeKnowledgeEdges(memoryId: string, edgeSpecs: L3JudgeEdge[]): Promise<void> {
    const now = Date.now();
    const tasks = edgeSpecs
      .filter(spec => spec.targetId && spec.targetId !== memoryId && spec.relation)
      .map(async spec => {
        const [minId, maxId] = [memoryId, spec.targetId].sort();
        const canonicalId = `edge_${minId}_${maxId}`;
        const weight = Math.max(0, Math.min(1, spec.weight ?? 0.6));

        // Forward edge (source → target)
        const fwd: MemoryEdge = {
          id: canonicalId,
          sourceId: minId,
          targetId: maxId,
          relation: spec.relation,
          weight,
          coOccurrenceCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        await memoryStore.putEdge(fwd);

        // Reverse edge (target → source) with symmetric canonical id but swapped endpoints
        // stored separately to allow by-source and by-target index lookups.
        const rev: MemoryEdge = {
          id: `edge_${maxId}_${minId}`,
          sourceId: maxId,
          targetId: minId,
          relation: spec.relation,
          weight,
          coOccurrenceCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        await memoryStore.putEdge(rev);
      });

    await Promise.allSettled(tasks);
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
        stability: growStability(match.stability),
        lastAccessedAt: Date.now(),
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
        updatedAt: Date.now(),
        stability: initialStability(),
        lastAccessedAt: Date.now(),
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
   * Process L2 (Skill Rules) - skillName + optional contextScope matching.
   *
   * When the trace carries a contextScope, the lookup uses the composite index so
   * that rules for different contexts are stored independently rather than merged
   * into a single catch-all record.
   */
  async processL2Trace(trace: RawExperienceTrace): Promise<void> {
    if (trace.memoryLevel !== "L2") throw new Error("Expected L2 Trace");

    const skillName = trace.context.skillName;
    const contextScope = trace.context.contextScope as string | undefined;

    // Prefer a context-exact match; fall back to any existing rule for the skill.
    const contextMatches = await memoryStore.getL2RulesBySkillAndContext(skillName, contextScope);
    const match = contextMatches.length > 0 ? contextMatches[0] : undefined;

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
        stability: growStability(match.stability),
        lastAccessedAt: Date.now(),
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
        contextScope,
        parameterRules: typeof trace.suggestedCorrection === "string" ? trace.suggestedCorrection : JSON.stringify(trace.suggestedCorrection),
        status: "active",
        updatedAt: Date.now(),
        stability: initialStability(),
        lastAccessedAt: Date.now(),
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
   * Compute and attach an embedding to an L3 rule before it is persisted.
   * Returns the rule unchanged when the embedder is unavailable or fails.
   * Never throws — embedding is best-effort and must not block memory commit.
   */
  private async attachEmbedding(rule: L3TacticalMemory): Promise<L3TacticalMemory> {
    try {
      const text = l3Embedder.buildText(rule);
      const embedding = await l3Embedder.embed(text);
      if (embedding) return { ...rule, embedding };
    } catch {
      // Intentionally swallowed — embedding is non-critical.
    }
    return rule;
  }

  /**
   * Process L3 (Tactical SOP) - BM25 + LLM Judge Deduplication
   */
  async processL3Memory(goal: string, memory: ClassifiedMemory): Promise<MemoryRefRecord | undefined> {
    const intentQuery = memory.scope.taskType || goal;
    const newRules = memory.memoryText;
    const memoryTitle = memory.title;
    const taskType = memory.scope.taskType;
    const domainScope = memory.domainScope || memory.scope.domain;
    const language = memory.language || inferL3Language({
      memoryTitle,
      intentQuery,
      tacticalRules: newRules,
      domainScope,
      taskType,
      keywords: memory.keywords,
    });
    const keywords = buildL3Keywords({
      memoryTitle,
      intentQuery,
      tacticalRules: newRules,
      domainScope,
      taskType,
      language,
      keywords: memory.keywords,
    });

    // 1. Fetch top similar SOPs from local BM25 index
    const similarDocs = await l3Bm25Index.search(`${memoryTitle} ${intentQuery} ${newRules}`, {
      domainScope,
      taskType,
      language,
      limit: 5,
    });

    // 2. Ask LLM Judge to decide
    const judgeDecision = await this.llm.judgeL3Trace(intentQuery, newRules, similarDocs);

    if (judgeDecision.action === "IGNORE") {
      console.log(`[MemoryDistiller] L3 Trace Ignored (Redundant intent: ${intentQuery})`);
      return undefined;
    }

    if (judgeDecision.action === "MERGE" && judgeDecision.targetId) {
      const targetDoc = similarDocs.find(d => d.id === judgeDecision.targetId);
      if (!targetDoc) throw new Error(`LLM returned invalid targetId: ${judgeDecision.targetId}`);

      // Collect related IDs: other similar docs that are not the merge target
      const newRelatedIds = similarDocs
        .filter(d => d.id !== judgeDecision.targetId)
        .map(d => d.id);

      const updatedRule: L3TacticalMemory = {
        ...targetDoc,
        memoryTitle: memoryTitle || targetDoc.memoryTitle,
        taskType: taskType || targetDoc.taskType,
        domainScope: domainScope || targetDoc.domainScope,
        language: language || targetDoc.language,
        keywords: Array.from(new Set([...(targetDoc.keywords || []), ...keywords])),
        tacticalRules: judgeDecision.mergedContent || newRules,
        updatedAt: Date.now(),
        usageCount: targetDoc.usageCount || 0,
        successCount: targetDoc.successCount || 0,
        relatedMemoryIds: Array.from(
          new Set([...(targetDoc.relatedMemoryIds ?? []), ...newRelatedIds])
        ).slice(0, 10),
        // Being merged into = still valuable → grow stability
        stability: growStability(targetDoc.stability),
        lastAccessedAt: Date.now(),
        // Preserve existing memoryType; new memory may override if explicitly set
        memoryType: memory.memoryType || targetDoc.memoryType || 'positive',
      };

      // Attach embedding before write (best-effort, never blocks on failure).
      const mergedRule = await this.attachEmbedding(updatedRule);

      // Write to IndexedDB
      await memoryStore.putL3Rule(mergedRule);
      await l3Bm25Index.rebuild();

      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "update",
        memoryLevel: "L3",
        targetId: mergedRule.id,
        payload: mergedRule,
        queuedAt: Date.now()
      });

      // Write knowledge-graph edges fire-and-forget.
      void this.writeKnowledgeEdges(mergedRule.id, judgeDecision.edges);

      console.log(`[MemoryDistiller] L3 Trace Merged into ${judgeDecision.targetId}`);
      return {
        id: mergedRule.id,
        level: "L3",
        title: mergedRule.memoryTitle,
        memoryText: mergedRule.tacticalRules,
      };
    } else if (judgeDecision.action === "INSERT" || (judgeDecision.action === "MERGE" && !judgeDecision.targetId)) {
      // All similar docs found during search become related memories for a new INSERT
      const relatedIds = similarDocs.map(d => d.id).slice(0, 10);

      const newRule: L3TacticalMemory = {
        id: this.generateId("tac"),
        intentQuery,
        memoryTitle,
        taskType,
        domainScope,
        language,
        keywords,
        tacticalRules: judgeDecision.mergedContent || newRules,
        updatedAt: Date.now(),
        usageCount: 0,
        successCount: 0,
        relatedMemoryIds: relatedIds,
        memoryType: memory.memoryType || 'positive',
        stability: initialStability(),
        lastAccessedAt: Date.now(),
      };

      // Attach embedding before write (best-effort, never blocks on failure).
      const insertedRule = await this.attachEmbedding(newRule);

      await memoryStore.putL3Rule(insertedRule);
      await l3Bm25Index.rebuild();

      await memoryStore.enqueueSync({
        id: `sync_${Date.now()}`,
        action: "insert",
        memoryLevel: "L3",
        targetId: insertedRule.id,
        payload: insertedRule,
        queuedAt: Date.now()
      });

      // Write knowledge-graph edges fire-and-forget.
      void this.writeKnowledgeEdges(insertedRule.id, judgeDecision.edges);

      console.log(`[MemoryDistiller] L3 Trace Inserted as new SOP`);
      return {
        id: insertedRule.id,
        level: "L3",
        title: insertedRule.memoryTitle,
        memoryText: insertedRule.tacticalRules,
      };
    }

    return undefined;
  }
}
