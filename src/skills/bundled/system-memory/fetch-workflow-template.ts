/**
 * System Skill: fetch_workflow_template
 *
 * 内置、不可卸载的系统 Skill。Planner 收到目录清单（L3 工作流名称列表）后，
 * 如判断有匹配的历史经验模板，主动调用此 Skill 拉取完整 SOP 纳入思考链。
 *
 * 贯彻"万物皆为 Skill"的 Harness 架构理念。
 */

import type { Skill } from "../../types";
import { l3Bm25Index } from "../../../memory/retrieval/l3-bm25-index";
import { L3WorkflowMeta } from "../../../shared/types/memory";

const SKILL_MANUAL = `
# fetch_workflow_template — L3 工作流经验模板拉取

## 用途
当系统提示词目录清单中列出了匹配的历史经验模板，
而你需要获取该模板的**完整操作步骤（SOP）**时，调用此 Skill。

## 参数
- query (string, 必填): 描述当前任务意图的自然语言，例如 "在 Notion 中创建一个共享文档"
- taskType (string, 可选): 当前任务类型，例如 "创建文档"
- domainScope (string, 可选): 当前操作的域名，例如 "notion.so"
- limit (number, 可选): 最多返回几条模板，默认 2

## 返回值
JSON 字符串，包含匹配到的工作流模板列表，每条包含完整的操作步骤（tacticalRules）。

## 使用时机
- 面对复杂的多步骤操作任务时
- 当历史经验目录中出现高度相关的模板时
- 当你不确定某个平台的具体操作流程时
`.trim();

export const fetchWorkflowTemplateSkill: Skill = {
  name: "fetch_workflow_template",
  description:
    "【系统内置】按需拉取 L3 历史经验工作流模板（SOP）。当历史经验目录中有匹配项，且需要了解完整操作步骤时调用。",
  role: "query",
  type: "local",
  params: {
    query: "自然语言描述当前任务意图（必填），例如 '在 Notion 中创建共享文档'",
    taskType: "任务类型（可选），例如 '创建文档'",
    domainScope: "当前域名（可选），例如 'notion.so'",
    limit: "最多返回条数（可选），默认 2",
  },

  async execute(params: {
    query: string;
    taskType?: string;
    domainScope?: string;
    limit?: number;
  }): Promise<string> {
    const { query, taskType, domainScope, limit = 2 } = params;
    if (!query?.trim()) {
      return JSON.stringify({ error: "query is required" });
    }

    const items = await l3Bm25Index.search(query, {
      taskType,
      domainScope,
      limit: limit + 5, // fetch extra for anti-pattern filtering
    });

    // Filter out anti-patterns — only return positive experience templates
    const positiveItems = items.filter((item) => {
      const m = item.meta as L3WorkflowMeta;
      return m.memoryType !== "anti_pattern";
    }).slice(0, limit);

    if (positiveItems.length === 0) {
      return JSON.stringify({
        query,
        templates: [],
        message: "暂无匹配的历史经验模板，请根据常规思路规划。",
      });
    }

    const templates = positiveItems.map((item) => {
      const m = item.meta as L3WorkflowMeta;
      return {
        id: item.id,
        title: item.title,
        taskType: m.taskType,
        domainScope: m.domainScope,
        language: m.language,
        tacticalRules: m.tacticalRules,
        usageCount: m.usageCount || 0,
        successCount: m.successCount || 0,
        stability: item.stability,
      };
    });

    return JSON.stringify({ query, templates });
  },

  async getManual(): Promise<string> {
    return SKILL_MANUAL;
  },
};
