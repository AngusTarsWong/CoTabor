import { Skill } from "../../skills/types";
import { L2RuleMeta } from "../../shared/types/memory";
import { retrieveL2RulesBySkillNames } from "./l2-rule-retriever";

export async function enrichSkillsWithL2Memory(skills: Skill[], taskType?: string): Promise<Skill[]> {
  const l2Rules = await retrieveL2RulesBySkillNames(skills.map((skill) => skill.name), taskType);

  return skills.map((skill) => {
    const pair = l2Rules.get(skill.name);
    if (!pair) return skill;

    const ruleParts = [
      (pair.base?.meta as L2RuleMeta | undefined)?.parameterRules?.trim(),
      (pair.contextual?.meta as L2RuleMeta | undefined)?.parameterRules?.trim(),
    ].filter(Boolean);

    if (ruleParts.length === 0) return skill;

    return {
      ...skill,
      description: `${skill.description}\n[L2 Memory Rules] ${ruleParts.join(" | ")}`,
    };
  });
}
