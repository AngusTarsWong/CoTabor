import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { L1MuscleMemory, L3RetrievalMatch, TaskExperienceBuffer } from "../../shared/types/memory";
import type { NodeMemoryUsage } from "../../memory/retrieval/memory-usage-builder";

/**
 * 任务单元定义
 */
export interface Task {
  id: string;
  goal: string;
  status: '待办' | '进行中' | '已完成';
}

/**
 * 核心状态定义：参考 adb_auto/PyMidscene/core/agent_langgraph/langgraph_config/state.py
 */
export const AgentStateAnnotation = Annotation.Root({
  // 用户原始请求
  request: Annotation<string>(),

  // --- Chat History for UI / Debugging ---
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // --- Memory System (Three DBs + One Zone) ---
  
  // 1. Full Log (Traceability) - 完整日志
  total_history: Annotation<any[]>({
    reducer: (curr, update) => update, // 每次完整替换数组，节点内部需要负责追加 [...curr, newItem]
    default: () => [],
  }),

  // 2. Long Term Memory - 长期记忆与提炼的数据
  long_term_memory: Annotation<{ summary: string; notebook: Record<string, any>; offset: number; rag_context?: string }>({
    reducer: (curr, update) => ({
      ...curr,
      ...update,
      notebook: { ...(curr?.notebook || {}), ...(update?.notebook || {}) } // 深度合并 notebook
    }),
    default: () => ({ summary: "", notebook: {}, offset: 0 }),
  }),

  // 3. Scratchpad - 脏数据区/暂存区(Cortex使用)
  scratchpad: Annotation<any[]>({
    reducer: (curr, update) => curr.concat(update), // 恢复为 concat，因为 cortex.ts 返回的是新增的数组项
    default: () => [],
  }),

  retrieved_memories: Annotation<{
    l1Prompt?: string;
    l3Prompt?: string;
    plannerContext?: string;
    replannerContext?: string;
    executorL1Hints?: string[];
    l1Rules?: L1MuscleMemory[];
    l2Rules?: string[];
    /** Debug only: L3 retrieval matches with per-factor score breakdown. */
    l3Matches?: L3RetrievalMatch[];
  }>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({ l1Prompt: "", l3Prompt: "", plannerContext: "", replannerContext: "", executorL1Hints: [], l1Rules: [], l2Rules: [] }),
  }),

  node_memory_usage: Annotation<NodeMemoryUsage | null>({
    reducer: (_curr, update) => update,
    default: () => null,
  }),

  // --- Parallel Execution Outputs ---
  // Planner 和 Watchdog 并行输出的结果暂存区
  planner_output: Annotation<Record<string, any> | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  watchdog_output: Annotation<Record<string, any> | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),

  // --- Cortex Subgraph Outputs ---
  cortex_action: Annotation<Record<string, any> | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  cortex_thought: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  cortex_memory_buffer: Annotation<any[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // --- Current State Snapshot ---
  screenshot: Annotation<string>({
    reducer: (curr, update) => update,
    default: () => "",
  }),

  // --- Task List (Planner & Router Managed) ---
  task_list: Annotation<Task[]>({
    reducer: (curr, update) => update,
    default: () => [],
  }),

  // --- Control Flow & Metadata ---
  status: Annotation<'RUNNING' | 'STOPPING' | 'STOPPED' | 'FINISHED' | 'FAILED' | 'NEEDS_REPLAN' | 'CORTEX_RECOVERY'>({
    reducer: (curr, update) => update,
    default: () => 'RUNNING',
  }),
  stop_requested: Annotation<boolean>({
    reducer: (curr, update) => update,
    default: () => false,
  }),
  stop_reason: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  stop_requested_at: Annotation<number | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  llm_payloads: Annotation<any[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
  
  // --- Perception & Fallback System ---
  perception_mode: Annotation<'DOM' | 'VISION'>({
    reducer: (curr, update) => update,
    default: () => 'DOM',
  }),
  cortex_retry_count: Annotation<number>({
    reducer: (curr, update) => update === 0 ? 0 : curr + update, // if 0 is passed, reset, otherwise accumulate
    default: () => 0,
  }),
  last_error_context: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),

  // Replanner 写入的战略背景，Planner 下一轮读取后清空
  replan_context: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),

  // Replanner 调用次数，用于防止死循环
  replan_count: Annotation<number>({
    reducer: (curr, update) => update,
    default: () => 0,
  }),

  meta_data: Annotation<Record<string, any>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),

  last_observation: Annotation<Record<string, any> | null>({
    reducer: (_curr, update) => update,
    default: () => null,
  }),

  // --- Multi-Tab Support ---
  active_tab_id: Annotation<number | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  opened_tabs: Annotation<Array<{ tabId: number; title: string; url: string }>>({
    reducer: (curr, update) => update,
    default: () => [],
  }),

  // --- Skill System ---
  available_skills: Annotation<any[]>({
    reducer: (curr, update) => update,
    default: () => [],
  }),

  // --- Triple-Core Memory System ---
  experience_buffer: Annotation<TaskExperienceBuffer>({
    reducer: (curr, update) => ({
      site_insights: [...(curr?.site_insights || []), ...(update?.site_insights || [])],
      tool_insights: [...(curr?.tool_insights || []), ...(update?.tool_insights || [])],
      task_wisdom: [...(curr?.task_wisdom || []), ...(update?.task_wisdom || [])]
    }),
    default: () => ({ site_insights: [], tool_insights: [], task_wisdom: [] }),
  }),
});

// 导出状态类型供节点使用
export type AgentState = typeof AgentStateAnnotation.State;
