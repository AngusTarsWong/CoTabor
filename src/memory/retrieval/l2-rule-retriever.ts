import { L2SkillMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";

function scoreL2Rule(rule: L2SkillMemory): number {
  const hitCount = rule.hitCount || 0;
  const successCount = rule.successCount || 0;
  return Math.min(hitCount * 0.1, 2) + Math.min(successCount * 0.2, 2);
}

export async function retrieveL2RuleBySkill(skillName: string): Promise<L2SkillMemory | undefined> {
  const rule = await memoryStore.getL2RuleBySkill(skillName);
  return rule;
}

export async function retrieveL2RulesBySkillNames(skillNames: string[]): Promise<Map<string, L2SkillMemory>> {
  const entries = await Promise.all(
    skillNames.map(async (skillName) => [skillName, await retrieveL2RuleBySkill(skillName)] as const)
  );

  const result = new Map<string, L2SkillMemory>();
  entries.forEach(([skillName, rule]) => {
    if (rule) {
      result.set(skillName, rule);
    }
  });

  return new Map([...result.entries()].sort((a, b) => scoreL2Rule(b[1]) - scoreL2Rule(a[1])));
}

