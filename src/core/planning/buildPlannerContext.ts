import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { getPageDriver } from "../../drivers/page";
import { log } from "../../shared/utils/log";
import type { AgentState, Task, SubAgentTaskResult } from "../graph/state";
import type { Skill } from "../../skills/types";
import type { HistoryStep } from "../types/history";
import { buildHarnessMemoryContext } from "./build-harness-memory-context";

const TACTICAL_SKILLS = new Set([
  "browser_click_index",
  "browser_type_index",
  "browser_press_key",
  "browser_scroll_direction",
]);

const ROOT_DELEGATION_INSTRUCTION = `- **多路并发子任务 (spawn_subagent)**: 当任务包含多个互不依赖的子领域探索（例如：多网站比价、全网资讯收集）时，输出 \`{"type": "spawn_subagent", "subtasks": [...]}\` 启动并行子 Agent。**子 Agent 完成后结果自动写入 [Sub-Agent Results]，你继续推进主循环直接 finish 合成**。不要在 subtasks 中添加"汇总"节点——由你在 spawn_subagent 完成后自己 finish 合成。

并发子任务正确示例:
{
  "task_list": [
    { "id": "1", "goal": "全网竞品调研", "status": "进行中" }
  ],
  "type": "spawn_subagent",
  "description": "任务包含多个独立数据源，启动并行子任务。",
  "subtasks": [
    { "id": "jd", "title": "搜索京东", "goal": "在京东获取该商品价格并 memorize 结果", "dependsOn": [] },
    { "id": "tmall", "title": "搜索淘宝", "goal": "在淘宝获取该商品价格并 memorize 结果", "dependsOn": [] }
  ]
}`;

const LEAF_WORKER_INSTRUCTION = `- **子任务执行者边界**: 当前你是子 Agent，只负责完成当前分配的具体目标。请在当前任务范围内按顺序处理，并用 memorize / finish 交付结果。不要尝试启动新的子任务或进行任何委派操作。`;

export interface PlannerContext {
  systemPrompt: string;
  userPrompt: string;
  filteredSkills: Skill[];
  currentUrl: string;
  tabId: number | undefined;
  resolvedSystem: string;
  resolvedUser: string;
}

export type PlannerPromptVars = {
  skillsList: string;
  langInstruction: string;
  request: string;
  currentPlanStr: string;
  historyContext: string;
  notebookContext: string;
  /** Structured outputs from spawn_subagent child tasks — rendered separately from notebookContext. */
  subagentResultsContext: string;
  /** Harness hybrid context: L2 summary + L3 directory listing */
  retrievedMemoryContext: string;
  /** Explicit L1 historical hints section — injected as a dedicated system-level block */
  l1OperationalExperience: string;
  delegationInstruction: string;
  tabContextStr: string;
  lastObservationContext: string;
  recentHistory: string;
  errorContextStr: string;
  currentUrl: string;
  domContext: string;
  [key: string]: unknown;
};

/**
 * Resolves all dynamic context needed to build the planner prompt vars.
 * Handles initial DOM extraction, LTM rendering, skill filtering, and error context.
 */
export async function buildPlannerPromptVars(state: AgentState): Promise<{
  vars: PlannerPromptVars;
  filteredSkills: Skill[];
  currentUrl: string;
  tabId: number | undefined;
}> {
  const {
    request, total_history, long_term_memory, meta_data,
    available_skills, last_error_context, replan_context,
    task_list, retrieved_memories, last_observation, subagent_results,
  } = state;

  const tabId = meta_data?.boundTabId || meta_data?.tabId;

  // --- DOM context ---
  let domContext = meta_data?.page_content || "Current Page: Unknown (No content provided)";
  let currentUrl = meta_data?.url || "Unknown URL";

  if (tabId && (!meta_data?.page_content || meta_data.page_content === "Current Page: Unknown (No content provided)")) {
    try {
      log.info("[Planner]", `Initial DOM extraction for tab: ${tabId}...`);
      const pageDriver = getPageDriver();
      try { await pageDriver.init(tabId); } catch { /* already attached */ }
      domContext = await pageDriver.getSemanticDOM();
      log.info("[Planner]", "Initial DOM extracted.");
    } catch (e) {
      log.error("[Planner]", "Failed to extract DOM initially:", e);
      domContext = "Failed to extract DOM. " + (e instanceof Error ? e.message : String(e));
    }
  } else if (tabId) {
    const prevContent = meta_data?.page_content;
    if (prevContent && (prevContent.startsWith("[Skill Result:") || prevContent.startsWith("[Skill Manual:"))) {
      domContext = prevContent;
    }
  }

  // --- Harness memory context (L1 explicit / L2 summary / L3 directory) ---
  const ltm = long_term_memory || { summary: "", notebook: {} };
  const historyContext = ltm.summary ? `Long Term Memory (Summary):\n${ltm.summary}\n` : "";
  const notebookContext = Object.keys(ltm.notebook || {}).length > 0
    ? `Notebook (Extracted Data):\n${JSON.stringify(ltm.notebook, null, 2)}\n`
    : "";
  const { l1Section, memoryContext } = buildHarnessMemoryContext(state);
  const retrievedMemoryContext = memoryContext
    ? `Retrieved Memories:\n${memoryContext}\n`
    : "";


  // --- Tab context ---
  const openedTabsInfo = (state.opened_tabs || [])
    .map((t: { tabId: number; title: string; url: string }) => `[TabId: ${t.tabId}] ${t.title} (${t.url}) ${t.tabId === state.active_tab_id ? "<- ACTIVE" : ""}`)
    .join("\n");
  const tabContextStr = state.opened_tabs && state.opened_tabs.length > 0
    ? `\n#### 浏览器多标签页状态 (Tabs)\n当前激活的 TabId: ${state.active_tab_id || "未知"}\n已打开的标签页:\n${openedTabsInfo}\n`
    : "";

  // --- Recent history (STM) ---
  const recentHistory = total_history.slice(-5).map((h: HistoryStep) => {
    if (h.step_summary) {
      const resultDigest = h.result ? `\nRaw result: ${JSON.stringify(h.result).slice(0, 1000)}` : "";
      return `Step ${h.step}: ${h.step_summary}${resultDigest}`;
    }
    let actionStr = h.action.type;
    if (h.action.type === "ui_interact") actionStr += `(${h.action.intent})`;
    else if (h.action.type === "call_skill") actionStr += `(${h.action.skill_name}, ${JSON.stringify(h.action.params)})`;
    else if (h.action.type === "memorize") actionStr += `(${h.action.params?.key})`;
    return `Step ${h.step}: ${actionStr} -> ${JSON.stringify(h.result)}`;
  }).join("\n");

  // --- Skill filter ---
  const filteredSkills = (available_skills || []).filter((s: Skill) => !TACTICAL_SKILLS.has(s.name));
  const skillsList = filteredSkills.length > 0
    ? filteredSkills.map((s: Skill) => `- ${s.name} (${JSON.stringify(s.params)}): ${s.description}`).join("\n")
    : "None";

  // --- Error / replan context ---
  let errorContextStr = "";
  if (replan_context) {
    errorContextStr = `\n${replan_context}\n`;
  } else if (last_error_context) {
    errorContextStr = `\n[ATTENTION] Previous action failed: ${last_error_context}\nPlease adjust your plan based on this error.\n`;
  }

  const langInstruction = await getAgentLangInstruction();
  const allowSpawnSubagent = meta_data?.allowSpawnSubagent !== false && meta_data?.swarmMode !== true;
  const delegationInstruction = allowSpawnSubagent ? ROOT_DELEGATION_INSTRUCTION : LEAF_WORKER_INSTRUCTION;

  const subagentEntries = Object.values(subagent_results || {}) as SubAgentTaskResult[];
  const subagentResultsContext = subagentEntries.length > 0
    ? `Sub-Agent Results:\n${subagentEntries.map((r) =>
        `─── ${r.id}（目标: "${r.goal}"）───\n` +
        `  状态: ${r.success ? "成功" : "失败"}` +
        (r.summary ? ` | 总结: ${r.summary}` : "") +
        (r.error ? ` | 错误: ${r.error}` : "") +
        (Object.keys(r.notebook).length > 0
          ? `\n  采集数据: ${JSON.stringify(r.notebook).slice(0, 800)}`
          : "")
      ).join("\n\n")}\n`
    : "";

  const currentPlanStr = task_list && task_list.length > 0
    ? `${task_list.map((t: Task) => `- [${t.status}] ${t.goal}`).join("\n")}\n`
    : "尚未制定具体计划，请先拆解任务。";

  const lastObservationContext = last_observation
    ? `### [上一条工具返回]\n类型: ${last_observation.kind}\n工具: ${last_observation.skill_name || "N/A"}\n参数: ${JSON.stringify(last_observation.params || {})}\n内容:\n${String(last_observation.text || "").slice(0, 4000)}\n\n请优先基于这条工具返回推进下一步，不要重复调用同一个工具，除非你明确需要新的参数或上次调用失败。`
    : "";

  return {
    vars: {
      skillsList, langInstruction, request, currentPlanStr,
      historyContext, notebookContext, subagentResultsContext, retrievedMemoryContext,
      l1OperationalExperience: l1Section,
      delegationInstruction,
      tabContextStr, lastObservationContext, recentHistory,
      errorContextStr, currentUrl, domContext,
    },
    filteredSkills,
    currentUrl,
    tabId,
  };
}
