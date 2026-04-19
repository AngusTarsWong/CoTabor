import { DistillerLLM } from "../distiller/llm";
import { MemoryDistiller } from "../distiller";
import { memoryStore } from "../store/indexeddb";
import { ClassifiedMemory, L1MuscleMemory, L2SkillMemory } from "../../shared/types/memory";
import { ENV } from "../../shared/constants/env";

export class FormalMemoryWriter {
  private merger: DistillerLLM;
  private l3Distiller: MemoryDistiller;

  constructor() {
    const apiKey = ENV.PLANNER_CONFIG.apiKey;
    this.merger = new DistillerLLM(apiKey);
    this.l3Distiller = new MemoryDistiller(apiKey);
  }

  async write(goal: string, memory: ClassifiedMemory): Promise<"L1" | "L2" | "L3" | "DROP"> {
    switch (memory.level) {
      case "L1":
        await this.writeL1(memory);
        return "L1";
      case "L2":
        await this.writeL2(memory);
        return "L2";
      case "L3":
        await this.l3Distiller.processL3Memory(goal, memory);
        return "L3";
      default:
        return "DROP";
    }
  }

  private async writeL1(memory: ClassifiedMemory): Promise<void> {
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
  }

  private async writeL2(memory: ClassifiedMemory): Promise<void> {
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
  }
}
