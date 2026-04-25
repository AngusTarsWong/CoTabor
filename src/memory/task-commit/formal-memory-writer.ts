import { DistillerLLM } from "../distiller/llm";
import { MemoryDistiller } from "../distiller";
import { memoryStore } from "../store/indexeddb";
import { ClassifiedMemory, L1MuscleMemory, L2SkillMemory, MemoryRefRecord, MemoryWriteResult } from "../../shared/types/memory";
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
      case "L1":
        return {
          level: "L1",
          ref: await this.writeL1(memory),
        };
      case "L2":
        return {
          level: "L2",
          ref: await this.writeL2(memory),
        };
      case "L3":
        return {
          level: "L3",
          ref: await this.l3Distiller.processL3Memory(goal, memory),
        };
      default:
        return { level: "DROP" };
    }
  }

  private async writeL1(memory: ClassifiedMemory): Promise<MemoryRefRecord> {
    const domain = memory.scope.domain || "unknown";
    const pathPattern = memory.scope.path || "*";
    const actionType = "insight";
    const elementSelector = "memory-classifier";
    const existingRules = await memoryStore.getL1RulesByDomain(domain);
    const match = existingRules.find((rule) =>
      rule.pathPattern === pathPattern &&
      rule.elementSelector === elementSelector &&
      rule.actionType === actionType
    );

    const now = Date.now();
    const payload: L1MuscleMemory = match
      ? {
          ...match,
          physicalInstruction: await this.merger.mergeJSONRules(match.physicalInstruction, memory.memoryText),
          reason: memory.reason,
          executionCount: match.executionCount + 1,
          successCount: match.successCount + 1,
          updatedAt: now,
          // Writing to an existing rule signals it's still relevant → grow stability
          stability: growStability(match.stability),
          lastAccessedAt: now,
        }
      : {
          id: `mus_${now}_${Math.random().toString(36).slice(2, 7)}`,
          domain,
          pathPattern,
          elementSelector,
          actionType,
          physicalInstruction: memory.memoryText,
          reason: memory.reason,
          executionCount: 1,
          successCount: 1,
          updatedAt: now,
          stability: initialStability(),
          lastAccessedAt: now,
        };

    const action = match ? "update" : "insert";
    await memoryStore.putL1Rule(payload);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action,
      memoryLevel: "L1",
      targetId: payload.id,
      payload,
      queuedAt: now,
    });

    return {
      id: payload.id,
      level: "L1",
      title: memory.title,
      memoryText: memory.memoryText,
    };
  }

  private async writeL2(memory: ClassifiedMemory): Promise<MemoryRefRecord> {
    const skillName = memory.scope.skillName || "unknown_skill";
    const existing = await memoryStore.getL2RuleBySkill(skillName);
    const now = Date.now();
    const payload: L2SkillMemory = existing
      ? {
          ...existing,
          parameterRules: await this.merger.mergeJSONRules(existing.parameterRules, memory.memoryText),
          errorHistory: [existing.errorHistory, memory.reason].filter(Boolean).join("\n"),
          hitCount: (existing.hitCount || 0) + 1,
          successCount: (existing.successCount || 0) + 1,
          status: "active",
          updatedAt: now,
          stability: growStability(existing.stability),
          lastAccessedAt: now,
        }
      : {
          id: `skl_${now}_${Math.random().toString(36).slice(2, 7)}`,
          skillName,
          ruleType: "general",
          contextScope: memory.scope.taskType,
          parameterRules: memory.memoryText,
          errorHistory: memory.reason,
          hitCount: 1,
          successCount: 1,
          status: "active",
          updatedAt: now,
          stability: initialStability(),
          lastAccessedAt: now,
        };

    const action = existing ? "update" : "insert";
    await memoryStore.putL2Rule(payload);
    await memoryStore.enqueueSync({
      id: `sync_${now}_${Math.random().toString(36).slice(2, 5)}`,
      action,
      memoryLevel: "L2",
      targetId: payload.id,
      payload,
      queuedAt: now,
    });

    return {
      id: payload.id,
      level: "L2",
      title: memory.title,
      memoryText: memory.memoryText,
    };
  }
}
