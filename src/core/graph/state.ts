import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

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
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // 2. Long Term Memory - 长期记忆与提炼的数据
  long_term_memory: Annotation<Record<string, any>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({ summary: "", notebook: {}, offset: 0 }),
  }),

  // 3. Scratchpad - 脏数据区/暂存区(Cortex使用)
  scratchpad: Annotation<any[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
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
  task_list: Annotation<any[]>({
    reducer: (curr, update) => update,
    default: () => [],
  }),

  // --- Control Flow & Metadata ---
  status: Annotation<'RUNNING' | 'FINISHED' | 'FAILED' | 'NEEDS_REPLAN'>({
    reducer: (curr, update) => update,
    default: () => 'RUNNING',
  }),
  error: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),
  meta_data: Annotation<Record<string, any>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),
});

// 导出状态类型供节点使用
export type AgentState = typeof AgentStateAnnotation.State;
