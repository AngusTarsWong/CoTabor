import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { getPageDriver } from "../../drivers/page";
import { log } from "../../shared/utils/log";
import type { AgentState, Task } from "../graph/state";
import type { Skill } from "../../skills/types";
import type { HistoryStep } from "../types/history";
import { buildHarnessMemoryContext } from "./build-harness-memory-context";

const TACTICAL_SKILLS = new Set([
  "browser_click_index",
  "browser_type_index",
  "browser_press_key",
  "browser_scroll_direction",
]);

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
  /** Harness hybrid context: L2 summary + L3 directory listing */
  retrievedMemoryContext: string;
  /** Explicit L1 historical hints section — injected as a dedicated system-level block */
  l1OperationalExperience: string;
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
    task_list, retrieved_memories, last_observation,
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

  const currentPlanStr = task_list && task_list.length > 0
    ? `${task_list.map((t: Task) => `- [${t.status}] ${t.goal}`).join("\n")}\n`
    : "尚未制定具体计划，请先拆解任务。";

  const lastObservationContext = last_observation
    ? `### [上一条工具返回]\n类型: ${last_observation.kind}\n工具: ${last_observation.skill_name || "N/A"}\n参数: ${JSON.stringify(last_observation.params || {})}\n内容:\n${String(last_observation.text || "").slice(0, 4000)}\n\n请优先基于这条工具返回推进下一步，不要重复调用同一个工具，除非你明确需要新的参数或上次调用失败。`
    : "";

  return {
    vars: {
      skillsList, langInstruction, request, currentPlanStr,
      historyContext, notebookContext, retrievedMemoryContext,
      l1OperationalExperience: l1Section,
      tabContextStr, lastObservationContext, recentHistory,
      errorContextStr, currentUrl, domContext,
    },
    filteredSkills,
    currentUrl,
    tabId,
  };
}
