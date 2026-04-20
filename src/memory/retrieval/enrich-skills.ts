import { Skill } from "../../skills/types";
import { retrieveL2RulesBySkillNames } from "./l2-rule-retriever";

export async function enrichSkillsWithL2Memory(skills: Skill[]): Promise<Skill[]> {
  const l2Rules = await retrieveL2RulesBySkillNames(skills.map((skill) => skill.name));

  const enriched = await Promise.all(skills.map(async (skill) => {
    const rule = l2Rules.get(skill.name);
    if (!rule?.parameterRules?.trim()) return skill;

    return {
      ...skill,
      description: `${skill.description}\n[L2 Memory Rule] ${rule.parameterRules}`,
    };
  }));

  return enriched;
}
