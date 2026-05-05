/**
 * System Skill: query_rule
 *
 * 内置、不可卸载的系统 Skill。Planner 可在认为需要了解 L2 领域规则详情时主动调用，
 * 而不是在每次 Prompt 中盲目堆砌所有规则原文。
 *
 * 贯彻"万物皆为 Skill"的 Harness 架构理念。
 */

import type { Skill } from "../../types";
import { L2RuleMeta } from "../../../shared/types/memory";
import { retrieveAllL2ItemsForSkill } from "../../../memory/retrieval/l2-rule-retriever";

const SKILL_MANUAL = `
# query_rule — L2 领域规则查询

## 用途
当你在规划时发现系统提示词中提及了某些领域规则摘要，
但你需要了解该规则的**完整内容**来做出更精确的决策时，调用此 Skill。

## 参数
- skillName (string, 必填): 要查询规则的技能名称，例如 "notion_operator"
- taskType (string, 可选): 任务类型上下文，用于检索特定场景的规则，例如 "创建文档"

## 返回值
JSON 字符串，包含该 Skill 的完整 L2 规则原文。
如果没有找到规则，返回空数组。

## 使用时机
- 在执行涉及特定 Skill 的复杂任务时
- 当你不确定某个 Skill 的参数格式或使用限制时
- 当摘要中提示某条规则可能与当前任务相关时
`.trim();

export const queryRuleSkill: Skill = {
  name: "query_rule",
  description:
    "【系统内置】查询特定 Skill 的 L2 领域规则详情。当你需要了解某项技能的使用规范或限制时调用。",
  role: "query",
  type: "local",
  params: {
    skillName: "要查询的 Skill 名称（必填），例如 'notion_operator'",
    taskType: "任务类型上下文（可选），例如 '创建文档'",
  },

  async execute(params: { skillName: string; taskType?: string }): Promise<string> {
    const { skillName, taskType } = params;
    if (!skillName) {
      return JSON.stringify({ error: "skillName is required" });
    }

    const candidates = await retrieveAllL2ItemsForSkill(skillName);

    // If taskType given, prefer contextual rules; fallback to all
    let results = candidates;
    if (taskType) {
      const contextual = candidates.filter((item) => {
        const m = item.meta as L2RuleMeta;
        return m.contextScope === taskType;
      });
      if (contextual.length > 0) results = contextual;
    }

    if (results.length === 0) {
      return JSON.stringify({ skillName, rules: [], message: "暂无该技能的领域规则记录。" });
    }

    const rules = results.map((item) => {
      const m = item.meta as L2RuleMeta;
      return {
        id: item.id,
        ruleScope: m.ruleScope || "base",
        contextScope: m.contextScope,
        parameterRules: m.parameterRules,
        hitCount: m.hitCount || 0,
        stability: item.stability,
      };
    });

    return JSON.stringify({ skillName, taskType: taskType || null, rules });
  },

  async getManual(): Promise<string> {
    return SKILL_MANUAL;
  },
};
