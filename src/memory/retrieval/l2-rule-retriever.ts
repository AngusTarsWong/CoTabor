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

function isActiveRule(meta: L2RuleMeta): boolean {
  return meta.status === 'active';
}

function matchesSkill(meta: L2RuleMeta, skillName: string): boolean {
  return meta.skillName === skillName;
}

function matchesTaskType(meta: L2RuleMeta, taskType: string): boolean {
  return meta.contextScope === taskType;
}

function scoreL2Item(item: MemoryItem): number {
  const m = item.meta as L2RuleMeta;
  const hitCount = m.hitCount || 0;
  const successCount = m.successCount || 0;
  const retentionBonus = computeRetention(item) * 1.0;
  return Math.min(hitCount * 0.1, 2) + Math.min(successCount * 0.2, 2) + retentionBonus;
}

function sortByScore(items: MemoryItem[]): MemoryItem[] {
  return items.sort((a, b) => scoreL2Item(b) - scoreL2Item(a));
}

function filterSkillScopedActiveItems(items: MemoryItem[], skillName: string): MemoryItem[] {
  return items.filter((item) => {
    const meta = item.meta as L2RuleMeta;
    return matchesSkill(meta, skillName) && isActiveRule(meta);
  });
}

export async function retrieveAllL2ItemsForSkill(skillName: string): Promise<MemoryItem[]> {
  const items = await memoryProvider.search({ type: 'L2_RULE', anyTags: [`skill:${skillName}`], limit: 100 });
  return sortByScore(filterSkillScopedActiveItems(items, skillName));
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
      const allItems = await retrieveAllL2ItemsForSkill(skillName);

      // Base rules: ruleScope==='base' or legacy rules (no contextScope)
      const baseItems = allItems.filter((item) => {
        const m = item.meta as L2RuleMeta;
        return m.ruleScope === 'base' || (m.ruleScope === undefined && !m.contextScope);
      });
      if (baseItems.length > 0) {
        pair.base = sortByScore(baseItems)[0];
      } else if (allItems.length > 0 && !taskType) {
        pair.base = sortByScore(allItems)[0];
      }

      // Contextual rules
      if (taskType) {
        const filtered = allItems.filter((item) => {
          const m = item.meta as L2RuleMeta;
          return matchesTaskType(m, taskType) && (m.ruleScope === 'contextual' || m.contextScope === taskType);
        });
        if (filtered.length > 0) {
          pair.contextual = sortByScore(filtered)[0];
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
