import { memoryProvider, generateMemoryId } from "../store/memory-provider";
import { memoryStore } from "../store/indexeddb";
import { l3Bm25Index } from "../retrieval/l3-bm25-index";
import { buildL3Keywords, inferL3Language } from "../retrieval/l3-query-preprocessor";
import { DistillerLLM, L3JudgeEdge } from "./llm";
import {
  MemoryItem, MemoryEdge, MemoryRefRecord, RawExperienceTrace,
  ClassifiedMemory, L1HintMeta, L2RuleMeta, L3WorkflowMeta,
} from "../../shared/types/memory";
import { growStability, initialStability } from "../retrieval/heat";

export class MemoryDistiller {
  private llm: DistillerLLM;

  constructor(openAIApiKey: string) {
    this.llm = new DistillerLLM(openAIApiKey);
  }

  private async writeKnowledgeEdges(memoryId: string, edgeSpecs: L3JudgeEdge[]): Promise<void> {
    const now = Date.now();
    const tasks = edgeSpecs
      .filter((spec) => spec.targetId && spec.targetId !== memoryId && spec.relation)
      .map(async (spec) => {
        const [minId, maxId] = [memoryId, spec.targetId].sort();
        const weight = Math.max(0, Math.min(1, spec.weight ?? 0.6));
        const fwd: MemoryEdge = {
          id: `edge_${minId}_${maxId}`,
          sourceId: minId, targetId: maxId,
          relation: spec.relation, weight, coOccurrenceCount: 0, createdAt: now, updatedAt: now,
        };
        await memoryStore.putEdge(fwd);
        const rev: MemoryEdge = {
          id: `edge_${maxId}_${minId}`,
          sourceId: maxId, targetId: minId,
          relation: spec.relation, weight, coOccurrenceCount: 0, createdAt: now, updatedAt: now,
        };
        await memoryStore.putEdge(rev);
      });
    await Promise.allSettled(tasks);
  }

  // ── L1 ──────────────────────────────────────────────────────────────────────

  async processL1Trace(trace: RawExperienceTrace): Promise<void> {
    if (trace.memoryLevel !== "L1") throw new Error("Expected L1 Trace");
    const domain = trace.context.domain;
    const pathPattern = trace.context.pathPattern;
    const selector = trace.context.elementSelector;
    const domainTag = `domain:${domain}`;

    const existing = await memoryProvider.search({ type: "L1_HINT", anyTags: [domainTag] });
    const match = existing.find((item) => {
      const m = item.meta as L1HintMeta;
      return m.pathPattern === pathPattern && m.elementSelector === selector;
    });

    const now = Date.now();
    const correctionStr = typeof trace.suggestedCorrection === "string"
      ? trace.suggestedCorrection
      : JSON.stringify(trace.suggestedCorrection);

    let item: MemoryItem;
    if (match) {
      const m = match.meta as L1HintMeta;
      const mergedInstruction = await this.llm.mergeJSONRules(m.physicalInstruction, correctionStr);
      const updatedMeta: L1HintMeta = {
        ...m,
        physicalInstruction: mergedInstruction,
        executionCount: m.executionCount + 1,
        successCount: trace.success ? m.successCount + 1 : m.successCount,
      };
      item = {
        ...match,
        content: mergedInstruction,
        meta: updatedMeta,
        stability: growStability(match.stability),
        lastAccessedAt: now,
        updatedAt: now,
      };
    } else {
      const meta: L1HintMeta = {
        domain, pathPattern,
        elementSelector: selector,
        actionType: trace.context.actionType || "unknown",
        physicalInstruction: correctionStr,
        executionCount: 1,
        successCount: trace.success ? 1 : 0,
      };
      item = {
        id: generateMemoryId("L1_HINT"),
        type: "L1_HINT",
        content: correctionStr,
        title: `[L1] ${meta.actionType} @ ${domain}${pathPattern}`,
        tags: [domainTag],
        stability: initialStability(),
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
        meta,
      };
    }

    await memoryProvider.save(item);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action: match ? "update" : "insert",
      memoryLevel: "L1",
      targetId: item.id,
      payload: item,
      queuedAt: now,
    });
  }

  // ── L2 ──────────────────────────────────────────────────────────────────────

  async processL2Trace(trace: RawExperienceTrace): Promise<void> {
    if (trace.memoryLevel !== "L2") throw new Error("Expected L2 Trace");
    const skillName = trace.context.skillName;
    const contextScope = trace.context.contextScope as string | undefined;
    const ruleScope: "base" | "contextual" = contextScope ? "contextual" : "base";
    const skillTag = `skill:${skillName}`;
    const tags = contextScope ? [skillTag, `taskType:${contextScope}`] : [skillTag];

    const candidates = await memoryProvider.search({ type: "L2_RULE", anyTags: [skillTag] });
    const match = candidates.find((item) => {
      const m = item.meta as L2RuleMeta;
      return !contextScope ? !m.contextScope : m.contextScope === contextScope;
    });

    const now = Date.now();
    const correctionStr = typeof trace.suggestedCorrection === "string"
      ? trace.suggestedCorrection
      : JSON.stringify(trace.suggestedCorrection);

    let item: MemoryItem;
    if (match) {
      const m = match.meta as L2RuleMeta;
      const mergedRules = await this.llm.mergeJSONRules(m.parameterRules, correctionStr);
      const updatedMeta: L2RuleMeta = {
        ...m,
        parameterRules: mergedRules,
        errorHistory: [m.errorHistory, trace.context.error].filter(Boolean).join("\n"),
        hitCount: (m.hitCount || 0) + 1,
      };
      item = {
        ...match,
        content: mergedRules,
        meta: updatedMeta,
        stability: growStability(match.stability),
        lastAccessedAt: now,
        updatedAt: now,
      };
    } else {
      const meta: L2RuleMeta = {
        skillName, contextScope, ruleScope,
        parameterRules: correctionStr,
        hitCount: 1, successCount: 1,
        status: "active",
      };
      item = {
        id: generateMemoryId("L2_RULE"),
        type: "L2_RULE",
        content: correctionStr,
        title: `[L2] ${skillName}${contextScope ? ` (${contextScope})` : ""}`,
        tags,
        stability: initialStability(),
        lastAccessedAt: now,
        createdAt: now,
        updatedAt: now,
        meta,
      };
    }

    await memoryProvider.save(item);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action: match ? "update" : "insert",
      memoryLevel: "L2",
      targetId: item.id,
      payload: item,
      queuedAt: now,
    });
  }

  // ── L3 ──────────────────────────────────────────────────────────────────────

  async processL3Memory(goal: string, memory: ClassifiedMemory): Promise<MemoryRefRecord | undefined> {
    const intentQuery = memory.scope.taskType || goal;
    const newRules = memory.memoryText;
    const memoryTitle = memory.title;
    const taskType = memory.scope.taskType;
    const domainScope = memory.domainScope || memory.scope.domain;
    const language = memory.language || inferL3Language({
      memoryTitle, intentQuery, tacticalRules: newRules, domainScope, taskType, keywords: memory.keywords,
    });
    const keywords = buildL3Keywords({
      memoryTitle, intentQuery, tacticalRules: newRules, domainScope, taskType, language, keywords: memory.keywords,
    });

    // 1. BM25 similarity search
    const similarItems = await l3Bm25Index.search(
      `${memoryTitle} ${intentQuery} ${newRules}`,
      { domainScope, taskType, language, limit: 5 },
    );

    // Format for LLM judge (any[] is fine for judgeL3Trace)
    const historyDocs = similarItems.map((item) => {
      const m = item.meta as L3WorkflowMeta;
      return {
        id: item.id,
        memoryTitle: item.title,
        intentQuery: m.intentQuery,
        taskType: m.taskType,
        domainScope: m.domainScope,
        tacticalRules: m.tacticalRules,
      };
    });

    // 2. LLM judge
    const judgeDecision = await this.llm.judgeL3Trace(intentQuery, newRules, historyDocs);

    if (judgeDecision.action === "IGNORE") {
      console.log(`[MemoryDistiller] L3 Trace Ignored (Redundant: ${intentQuery})`);
      return undefined;
    }

    const now = Date.now();
    const tags: string[] = [];
    if (domainScope) tags.push(`domain:${domainScope}`);
    if (taskType) tags.push(`taskType:${taskType}`);
    if (language) tags.push(`lang:${language}`);

    if (judgeDecision.action === "MERGE" && judgeDecision.targetId) {
      const targetItem = similarItems.find((i) => i.id === judgeDecision.targetId);
      if (!targetItem) throw new Error(`LLM returned invalid targetId: ${judgeDecision.targetId}`);
      const targetMeta = targetItem.meta as L3WorkflowMeta;
      const newRelatedIds = similarItems.filter((i) => i.id !== judgeDecision.targetId).map((i) => i.id);

      const updatedMeta: L3WorkflowMeta = {
        ...targetMeta,
        taskType: taskType || targetMeta.taskType,
        domainScope: domainScope || targetMeta.domainScope,
        language: language || targetMeta.language,
        keywords: Array.from(new Set([...(targetMeta.keywords || []), ...keywords])),
        tacticalRules: judgeDecision.mergedContent || newRules,
        usageCount: targetMeta.usageCount || 0,
        successCount: targetMeta.successCount || 0,
        relatedMemoryIds: Array.from(new Set([...(targetMeta.relatedMemoryIds ?? []), ...newRelatedIds])).slice(0, 10),
        memoryType: memory.memoryType || targetMeta.memoryType || "positive",
        sourceType: memory.sourceType || targetMeta.sourceType || 'agent',
        dagPattern: memory.dagPattern || targetMeta.dagPattern,
      };

      const mergedItem: MemoryItem = {
        ...targetItem,
        title: memoryTitle || targetItem.title,
        content: `${memoryTitle || targetItem.title} ${updatedMeta.tacticalRules}`,
        tags: Array.from(new Set([...targetItem.tags, ...tags])),
        meta: updatedMeta,
        stability: growStability(targetItem.stability),
        lastAccessedAt: now,
        updatedAt: now,
      };

      await memoryProvider.save(mergedItem);
      await l3Bm25Index.rebuild();
      await memoryStore.enqueueSync({
        id: `sync_${now}`, action: "update", memoryLevel: "L3",
        targetId: mergedItem.id, payload: mergedItem, queuedAt: now,
      });
      void this.writeKnowledgeEdges(mergedItem.id, judgeDecision.edges);

      console.log(`[MemoryDistiller] L3 Merged into ${judgeDecision.targetId}`);
      return { id: mergedItem.id, level: "L3", title: mergedItem.title, memoryText: updatedMeta.tacticalRules };
    }

    // INSERT
    const relatedIds = similarItems.map((i) => i.id).slice(0, 10);
    const meta: L3WorkflowMeta = {
      intentQuery, taskType, domainScope, language, keywords,
      tacticalRules: judgeDecision.mergedContent || newRules,
      usageCount: 0, successCount: 0,
      relatedMemoryIds: relatedIds,
      memoryType: memory.memoryType || "positive",
      sourceType: memory.sourceType || 'agent',
      dagPattern: memory.dagPattern,
    };
    const newItem: MemoryItem = {
      id: generateMemoryId("L3_WORKFLOW"),
      type: "L3_WORKFLOW",
      content: `${memoryTitle} ${meta.tacticalRules}`,
      title: memoryTitle,
      tags,
      stability: initialStability(),
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
      meta,
    };

    await memoryProvider.save(newItem);
    await l3Bm25Index.rebuild();
    await memoryStore.enqueueSync({
      id: `sync_${now}`, action: "insert", memoryLevel: "L3",
      targetId: newItem.id, payload: newItem, queuedAt: now,
    });
    void this.writeKnowledgeEdges(newItem.id, judgeDecision.edges);

    console.log(`[MemoryDistiller] L3 Inserted as new SOP`);
    return { id: newItem.id, level: "L3", title: newItem.title, memoryText: meta.tacticalRules };
  }
}

