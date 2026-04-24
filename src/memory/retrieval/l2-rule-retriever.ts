import { L2SkillMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";
import { computeRetention } from "./heat";

function scoreL2Rule(rule: L2SkillMemory): number {
  const hitCount = rule.hitCount || 0;
  const successCount = rule.successCount || 0;
  // Ebbinghaus retention bonus on top of usage counts.
  // Frequently-hit rules stay relevant longer; stale rules naturally rank lower.
  const retentionBonus = computeRetention(rule) * 1.0;
  return Math.min(hitCount * 0.1, 2) + Math.min(successCount * 0.2, 2) + retentionBonus;
}

/** Legacy single-rule lookup. Returns the highest-scored rule for a skill, ignoring context. */
export async function retrieveL2RuleBySkill(skillName: string): Promise<L2SkillMemory | undefined> {
  return memoryStore.getL2RuleBySkill(skillName);
}

/**
 * Retrieve L2 rules for multiple skills.
 *
 * When `contextScope` is provided, each skill is looked up using the composite
 * (skillName, contextScope) index so that context-specific rules are preferred.
 * Rules without a matching contextScope are included as fallback when no exact
 * match exists.
 *
 * Returns a Map keyed by skillName. Each value is the best-matching single rule
 * (highest score) for that skill in the given context. This keeps the downstream
 * contract stable: callers always get at most one rule per skill name.
 */
export async function retrieveL2RulesBySkillNames(
  skillNames: string[],
  contextScope?: string
): Promise<Map<string, L2SkillMemory>> {
  const entries = await Promise.all(
    skillNames.map(async (skillName) => {
      // 1. Try context-specific match first
      if (contextScope) {
        const contextRules = await memoryStore.getL2RulesBySkillAndContext(skillName, contextScope);
        if (contextRules.length > 0) {
          const best = contextRules.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a))[0];
          return [skillName, best] as const;
        }
      }
      // 2. Fall back to any rule for this skill (legacy behaviour)
      const rule = await memoryStore.getL2RuleBySkill(skillName);
      return [skillName, rule] as const;
    })
  );

  const result = new Map<string, L2SkillMemory>();
  entries.forEach(([skillName, rule]) => {
    if (rule) result.set(skillName, rule);
  });

  return new Map([...result.entries()].sort((a, b) => scoreL2Rule(b[1]) - scoreL2Rule(a[1])));
}

/**
 * Retrieve all L2 rules for a skill across every contextScope.
 * Useful for display/debug panels that want to show the full rule history for a skill.
 */
export async function retrieveAllL2RulesForSkill(skillName: string): Promise<L2SkillMemory[]> {
  const rules = await memoryStore.getL2RulesBySkillAndContext(skillName);
  return rules.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a));
}
