import { L2SkillMemory } from "../../shared/types/memory";
import { memoryStore } from "../store/indexeddb";
import { computeRetention } from "./heat";

/**
 * A pair of L2 rules for a single skill: a universal base rule and an optional
 * task-type-specific contextual rule. Both can be injected into the prompt together
 * so the agent always gets the universal guardrails PLUS any context-specific tuning.
 */
export type L2RulePair = {
  base?: L2SkillMemory;
  contextual?: L2SkillMemory;
};

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
 * Retrieve L2 rules for multiple skills, returning a base+contextual pair per skill.
 *
 * - base: the best-scored rule with ruleScope==='base', or any legacy rule without a contextScope
 *   (ensures older rules written before ruleScope was introduced continue to work)
 * - contextual: the best-scored rule whose contextScope matches `taskType` (only when taskType is provided)
 *
 * Callers always receive at most one base + one contextual rule per skill.
 */
export async function retrieveL2RulesBySkillNames(
  skillNames: string[],
  taskType?: string
): Promise<Map<string, L2RulePair>> {
  const entries = await Promise.all(
    skillNames.map(async (skillName): Promise<[string, L2RulePair]> => {
      const pair: L2RulePair = {};

      // --- Base rule ---
      // Prefer rules explicitly scoped as 'base'; fall back to legacy rules (no ruleScope set).
      const allRules = await memoryStore.getL2RulesBySkillAndContext(skillName);
      const baseRules = allRules.filter(
        r => r.ruleScope === 'base' || (r.ruleScope === undefined && !r.contextScope)
      );
      if (baseRules.length > 0) {
        pair.base = baseRules.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a))[0];
      } else if (allRules.length > 0 && !taskType) {
        // Legacy fallback: no base-scoped rule exists and no taskType requested — use top rule.
        pair.base = allRules.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a))[0];
      }

      // --- Contextual rule ---
      if (taskType) {
        const contextualRules = await memoryStore.getL2RulesBySkillAndContext(skillName, taskType);
        const filtered = contextualRules.filter(r => r.ruleScope === 'contextual' || r.contextScope === taskType);
        if (filtered.length > 0) {
          pair.contextual = filtered.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a))[0];
        }
      }

      return [skillName, pair];
    })
  );

  const result = new Map<string, L2RulePair>();
  entries.forEach(([skillName, pair]) => {
    if (pair.base || pair.contextual) {
      result.set(skillName, pair);
    }
  });

  return result;
}

/**
 * Retrieve all L2 rules for a skill across every contextScope.
 * Useful for display/debug panels that want to show the full rule history for a skill.
 */
export async function retrieveAllL2RulesForSkill(skillName: string): Promise<L2SkillMemory[]> {
  const rules = await memoryStore.getL2RulesBySkillAndContext(skillName);
  return rules.sort((a, b) => scoreL2Rule(b) - scoreL2Rule(a));
}
