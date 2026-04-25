import { Skill } from "../../skills/types";
import { retrieveL2RulesBySkillNames } from "./l2-rule-retriever";

export async function enrichSkillsWithL2Memory(skills: Skill[], taskType?: string): Promise<Skill[]> {
  const l2Rules = await retrieveL2RulesBySkillNames(skills.map(skill => skill.name), taskType);

  return skills.map(skill => {
    const pair = l2Rules.get(skill.name);
    if (!pair) return skill;

    const ruleParts = [
      pair.base?.parameterRules?.trim(),
      pair.contextual?.parameterRules?.trim(),
    ].filter(Boolean);

    if (ruleParts.length === 0) return skill;

    return {
      ...skill,
      description: `${skill.description}\n[L2 Memory Rules] ${ruleParts.join(' | ')}`,
    };
  });
}
