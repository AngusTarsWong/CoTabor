import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { getPageDriver } from "../../drivers/page";
import { log } from "../../shared/utils/log";
import type { AgentState, Task } from "../graph/state";
import type { Skill } from "../../skills/types";
import type { HistoryStep } from "../types/history";
import type { MemoryItem } from "../../shared/types/memory";
import { L1HintMeta, L2RuleMeta, L3WorkflowMeta } from "../../shared/types/memory";

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

// ─────────────────────────────────────────────────────────────────────────────
// Harness memory context builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the three-layer Harness memory context:
 *  - l1Section   : explicit system prompt block labelled "历史操作经验" (L1)
 *  - memoryContext: L2 summary + L3 directory listing (goes into retrievedMemoryContext)
 */
export function buildHarnessMemoryContext(state: {
  retrieved_memories?: {
    l1Items?: MemoryItem[];
    l2Rules?: string[];
    plannerContext?: string;
  };
}): { l1Section: string; memoryContext: string } {
  const { l1Items = [], l2Rules = [] } = state.retrieved_memories || {};

  // ── L1: explicit system-level injection ────────────────────────────────────
  let l1Section = "";
  if (l1Items.length > 0) {
    const hints = l1Items.slice(0, 3).map((item) => {
      const m = item.meta as L1HintMeta;
      const parts = [
        m.domain ? `域名: ${m.domain}` : "",
        m.pathPattern ? `路径: ${m.pathPattern}` : "",
        m.actionType ? `动作: ${m.actionType}` : "",
        m.physicalInstruction ? `指令: ${m.physicalInstruction.replace(/\s+/g, " ").trim()}` : "",
      ].filter(Boolean);
      return `  - ${parts.join(" | ")}`;
    }).join("\n");

    l1Section = [
      "## 📌 历史操作经验 (Historical Operational Experience)",
      "以下是系统从历史执行记录中提炼的、与当前页面高度相关的**页面级操作规律**。",
      "执行低级别 UI 操作时，**优先遵循**这些经验，避免重复试错：",
      hints,
    ].join("\n");
  }

  // ── L2: summary injection (directory hint → call query_rule for details) ──
  const parts: string[] = [];
  if (l2Rules.length > 0) {
    const summary = l2Rules.length === 1
      ? `检测到 ${l2Rules.length} 条领域规则：${l2Rules[0].slice(0, 80)}${l2Rules[0].length > 80 ? "..." : ""}`
      : `检测到 ${l2Rules.length} 条领域规则，涉及：${l2Rules.slice(0, 3).map((r) => r.split(":")[0]).join("、")} 等技能`;
    parts.push(
      "### 💡 领域规则摘要 (L2 Domain Rules)",
      summary,
      "如需查看完整规则原文，请调用系统内置工具 `query_rule`。",
    );
  }

  // ── L3: directory listing (call fetch_workflow_template for full SOP) ──────
  const plannerCtx = state.retrieved_memories?.plannerContext || "";
  if (plannerCtx) {
    // Extract L3 item titles from the existing plannerContext
    const l3Lines = plannerCtx.split("\n").filter((l) => l.includes("标题=") || l.startsWith("- "));
    if (l3Lines.length > 0) {
      const titles = l3Lines
        .map((l) => {
          const m = l.match(/标题=([^|]+)/);
          return m ? m[1].trim() : l.replace(/^- /, "").split("|")[0].trim();
        })
        .filter(Boolean)
        .slice(0, 5);

      if (titles.length > 0) {
        parts.push(
          "",
          "### 📂 可用经验模板目录 (L3 Workflow Templates)",
          "以下历史经验模板与当前任务高度相关：",
          ...titles.map((t) => `  - ${t}`),
          "如需获取完整操作步骤（SOP），请调用系统内置工具 `fetch_workflow_template`。",
        );
      }
    }
  }

  return {
    l1Section,
    memoryContext: parts.length > 0 ? parts.join("\n") : "",
  };
}

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
  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
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
  const offset = ltm.offset || 0;
  const recentHistory = total_history.slice(offset).slice(-5).map((h: HistoryStep) => {
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
