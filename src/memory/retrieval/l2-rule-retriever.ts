import { MemoryItem, L2RuleMeta } from "../../shared/types/memory";
import { memoryProvider } from "../store/memory-provider";
import { computeRetention } from "./heat";

/**
 * A pair of L2 rule MemoryItems for a single skill:
 * a universal base rule and an optional task-type-specific contextual rule.
 */
export type L2RulePair = {
  base?: MemoryItem;
  contextual?: MemoryItem;
};

function scoreL2Item(item: MemoryItem): number {
  const m = item.meta as L2RuleMeta;
  const hitCount = m.hitCount || 0;
  const successCount = m.successCount || 0;
  const retentionBonus = computeRetention(item) * 1.0;
  return Math.min(hitCount * 0.1, 2) + Math.min(successCount * 0.2, 2) + retentionBonus;
}

/**
 * Retrieve L2 rule MemoryItems for multiple skills, returning a base+contextual pair per skill.
 */
export async function retrieveL2RulesBySkillNames(
  skillNames: string[],
  taskType?: string,
): Promise<Map<string, L2RulePair>> {
  const entries = await Promise.all(
    skillNames.map(async (skillName): Promise<[string, L2RulePair]> => {
      const pair: L2RulePair = {};
      const skillTag = `skill:${skillName}`;

      const allItems = await memoryProvider.search({ type: 'L2_RULE', anyTags: [skillTag] });

      // Base rules: ruleScope==='base' or legacy rules (no contextScope)
      const baseItems = allItems.filter((item) => {
        const m = item.meta as L2RuleMeta;
        return m.ruleScope === 'base' || (m.ruleScope === undefined && !m.contextScope);
      });
      if (baseItems.length > 0) {
        pair.base = baseItems.sort((a, b) => scoreL2Item(b) - scoreL2Item(a))[0];
      } else if (allItems.length > 0 && !taskType) {
        pair.base = allItems.sort((a, b) => scoreL2Item(b) - scoreL2Item(a))[0];
      }

      // Contextual rules
      if (taskType) {
        const taskTypeTag = `taskType:${taskType}`;
        const contextItems = await memoryProvider.search({
          type: 'L2_RULE',
          requiredTags: [skillTag, taskTypeTag],
        });
        const filtered = contextItems.filter((item) => {
          const m = item.meta as L2RuleMeta;
          return m.ruleScope === 'contextual' || m.contextScope === taskType;
        });
        if (filtered.length > 0) {
          pair.contextual = filtered.sort((a, b) => scoreL2Item(b) - scoreL2Item(a))[0];
        }
      }

      return [skillName, pair];
    }),
  );

  const result = new Map<string, L2RulePair>();
  entries.forEach(([skillName, pair]) => {
    if (pair.base || pair.contextual) result.set(skillName, pair);
  });
  return result;
}

/**
 * Retrieve all L2 rule MemoryItems for a skill across every contextScope.
 */
export async function retrieveAllL2ItemsForSkill(skillName: string): Promise<MemoryItem[]> {
  const items = await memoryProvider.search({ type: 'L2_RULE', anyTags: [`skill:${skillName}`] });
  return items.sort((a, b) => scoreL2Item(b) - scoreL2Item(a));
}
