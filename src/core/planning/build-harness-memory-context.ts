import type { MemoryItem } from "../../shared/types/memory";
import { L1HintMeta } from "../../shared/types/memory";

export interface HarnessMemoryState {
  retrieved_memories?: {
    l1Items?: MemoryItem[];
    l2Rules?: string[];
    l3Items?: MemoryItem[];
  };
}

export function buildHarnessMemoryContext(state: HarnessMemoryState): {
  l1Section: string;
  memoryContext: string;
} {
  const {
    l1Items = [],
    l2Rules = [],
    l3Items = [],
  } = state.retrieved_memories || {};

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

  if (l3Items.length > 0) {
    parts.push(
      "",
      "### 📂 可用经验模板目录 (L3 Workflow Templates)",
      "以下历史经验模板与当前任务高度相关：",
      ...l3Items.slice(0, 5).map((item) => `  - ${item.title}`),
      "如需获取完整操作步骤（SOP），请调用系统内置工具 `fetch_workflow_template`。",
    );
  }

  return {
    l1Section,
    memoryContext: parts.length > 0 ? parts.join("\n") : "",
  };
}
