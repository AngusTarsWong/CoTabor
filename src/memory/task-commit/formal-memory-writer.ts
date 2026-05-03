import { DistillerLLM } from "../distiller/llm";
import { MemoryDistiller } from "../distiller";
import { memoryProvider, generateMemoryId } from "../store/memory-provider";
import { memoryStore } from "../store/indexeddb";
import {
  ClassifiedMemory, MemoryItem, MemoryRefRecord, MemoryWriteResult,
  L1HintMeta, L2RuleMeta,
} from "../../shared/types/memory";
import { ENV } from "../../shared/constants/env";
import { growStability, initialStability } from "../retrieval/heat";

export class FormalMemoryWriter {
  private merger: DistillerLLM;
  private l3Distiller: MemoryDistiller;

  constructor() {
    const apiKey = ENV.PLANNER_CONFIG.apiKey;
    this.merger = new DistillerLLM(apiKey);
    this.l3Distiller = new MemoryDistiller(apiKey);
  }

  async write(goal: string, memory: ClassifiedMemory): Promise<MemoryWriteResult> {
    switch (memory.level) {
      case "L1": return { level: "L1", ref: await this.writeL1(memory) };
      case "L2": return { level: "L2", ref: await this.writeL2(memory) };
      case "L3": return { level: "L3", ref: await this.l3Distiller.processL3Memory(goal, memory) };
      default:   return { level: "DROP" };
    }
  }

  private async writeL1(memory: ClassifiedMemory): Promise<MemoryRefRecord> {
    const domain = memory.scope.domain || "unknown";
    const pathPattern = memory.scope.path || "*";
    const actionType = "insight";
    const elementSelector = "memory-classifier";
    const domainTag = `domain:${domain}`;

    const candidates = await memoryProvider.search({ type: "L1_HINT", anyTags: [domainTag] });
    const match = candidates.find((item) => {
      const m = item.meta as L1HintMeta;
      return m.pathPattern === pathPattern && m.elementSelector === elementSelector && m.actionType === actionType;
    });

    const now = Date.now();
    let item: MemoryItem;

    if (match) {
      const m = match.meta as L1HintMeta;
      const mergedInstruction = await this.merger.mergeJSONRules(m.physicalInstruction, memory.memoryText);
      const updatedMeta: L1HintMeta = {
        ...m, physicalInstruction: mergedInstruction, reason: memory.reason,
        executionCount: m.executionCount + 1, successCount: m.successCount + 1,
      };
      item = {
        ...match, content: mergedInstruction, meta: updatedMeta,
        stability: growStability(match.stability), lastAccessedAt: now, updatedAt: now,
      };
    } else {
      const meta: L1HintMeta = {
        domain, pathPattern, elementSelector, actionType,
        physicalInstruction: memory.memoryText, reason: memory.reason,
        executionCount: 1, successCount: 1,
      };
      item = {
        id: generateMemoryId("L1_HINT"),
        type: "L1_HINT",
        content: memory.memoryText,
        title: `[L1] ${actionType} @ ${domain}${pathPattern}`,
        tags: [domainTag],
        stability: initialStability(),
        lastAccessedAt: now, createdAt: now, updatedAt: now,
        meta,
      };
    }

    await memoryProvider.save(item);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action: match ? "update" : "insert",
      memoryLevel: "L1", targetId: item.id, payload: item, queuedAt: now,
    });

    return { id: item.id, level: "L1", title: memory.title, memoryText: memory.memoryText };
  }

  private async writeL2(memory: ClassifiedMemory): Promise<MemoryRefRecord> {
    const skillName = memory.scope.skillName || "unknown_skill";
    const contextScope = memory.scope.taskType || undefined;
    const ruleScope: "base" | "contextual" = contextScope ? "contextual" : "base";
    const skillTag = `skill:${skillName}`;
    const tags = contextScope ? [skillTag, `taskType:${contextScope}`] : [skillTag];

    const candidates = await memoryProvider.search({ type: "L2_RULE", anyTags: [skillTag] });
    const existing = candidates
      .filter((item) => {
        const m = item.meta as L2RuleMeta;
        return !contextScope ? !m.contextScope : m.contextScope === contextScope;
      })
      .sort((a, b) => ((b.meta as L2RuleMeta).hitCount ?? 0) - ((a.meta as L2RuleMeta).hitCount ?? 0))[0];

    const now = Date.now();
    let item: MemoryItem;

    if (existing) {
      const m = existing.meta as L2RuleMeta;
      const mergedRules = await this.merger.mergeJSONRules(m.parameterRules, memory.memoryText);
      const updatedMeta: L2RuleMeta = {
        ...m, parameterRules: mergedRules,
        errorHistory: [m.errorHistory, memory.reason].filter(Boolean).join("\n"),
        hitCount: (m.hitCount || 0) + 1, successCount: (m.successCount || 0) + 1,
        ruleScope: m.ruleScope ?? ruleScope, status: "active",
      };
      item = {
        ...existing, content: mergedRules, meta: updatedMeta,
        stability: growStability(existing.stability), lastAccessedAt: now, updatedAt: now,
      };
    } else {
      const meta: L2RuleMeta = {
        skillName, ruleType: "general", contextScope, ruleScope,
        parameterRules: memory.memoryText, errorHistory: memory.reason,
        hitCount: 1, successCount: 1, status: "active",
      };
      item = {
        id: generateMemoryId("L2_RULE"),
        type: "L2_RULE",
        content: memory.memoryText,
        title: `[L2] ${skillName}${contextScope ? ` (${contextScope})` : ""}`,
        tags,
        stability: initialStability(),
        lastAccessedAt: now, createdAt: now, updatedAt: now,
        meta,
      };
    }

    await memoryProvider.save(item);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action: existing ? "update" : "insert",
      memoryLevel: "L2", targetId: item.id, payload: item, queuedAt: now,
    });

    return { id: item.id, level: "L2", title: memory.title, memoryText: memory.memoryText };
  }
}
