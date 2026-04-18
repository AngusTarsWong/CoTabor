import { memoryStore } from "../store/indexeddb";
import { Skill } from "../../skills/types";

export async function enrichSkillsWithL2Memory(skills: Skill[]): Promise<Skill[]> {
  const enriched = await Promise.all(skills.map(async (skill) => {
    const rule = await memoryStore.getL2RuleBySkill(skill.name);
    if (!rule?.parameterRules?.trim()) return skill;

    return {
      ...skill,
      description: `${skill.description}\n[L2 Memory Rule] ${rule.parameterRules}`,
    };
  }));

  return enriched;
}
