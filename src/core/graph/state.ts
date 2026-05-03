import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { MemoryItem, L3RetrievalMatch, TaskExperienceBuffer } from "../../shared/types/memory";
import type { NodeMemoryUsage } from "../../memory/retrieval/memory-usage-builder";
import type { SubtaskDag } from "../types/dag";
import type { SchedulerRuntimeState } from "../types/scheduler";
import type { HistoryStep } from "../types/history";

/** Task list entry tracked by the planner. */
export interface Task {
  id: string;
  goal: string;
  status: '待办' | '进行中' | '已完成';
}

/** Core agent state definition. */
export const AgentStateAnnotation = Annotation.Root({
  // Original user request.
  request: Annotation<string>(),

  // --- Chat History for UI / Debugging ---
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  // --- Memory System (Three DBs + One Zone) ---
  
  // 1. Full execution log for traceability.
  total_history: Annotation<HistoryStep[]>({
    reducer: (_curr, update) => update, // Nodes own the full array; append with [...prev, newItem].
    default: () => [],
  }),

  // 2. Long-term memory and distilled artifacts.
  long_term_memory: Annotation<{ summary: string; notebook: Record<string, any>; offset: number; rag_context?: string }>({
    reducer: (curr, update) => ({
      ...curr,
      ...update,
      notebook: { ...(curr?.notebook || {}), ...(update?.notebook || {}) } // Deep-merge the notebook map.
    }),
    default: () => ({ summary: "", notebook: {}, offset: 0 }),
  }),

  // 3. Scratchpad for temporary recovery-time state.
  scratchpad: Annotation<any[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),

  retrieved_memories: Annotation<{
    l1Prompt?: string;
    l3Prompt?: string;
    plannerContext?: string;
    replannerContext?: string;
    executorL1Hints?: string[];
    l1Items?: MemoryItem[];
    l2Rules?: string[];
    /** Debug only: L3 retrieval matches with per-factor score breakdown. */
    l3Matches?: L3RetrievalMatch[];
  }>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({ l1Prompt: "", l3Prompt: "", plannerContext: "", replannerContext: "", executorL1Hints: [], l1Items: [], l2Rules: [] }),
  }),

  node_memory_usage: Annotation<NodeMemoryUsage | null>({
    reducer: (_curr, update) => update,
    default: () => null,
  }),

  // --- Parallel Execution Outputs ---
  // Planner and Watchdog outputs.
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

  // --- Coordinator Runtime ---
  use_multi_agent_scheduler: Annotation<boolean>({
    reducer: (_curr, update) => update,
    default: () => false,
  }),
  subtask_dag: Annotation<SubtaskDag | null>({
    reducer: (_curr, update) => update,
    default: () => null,
  }),
  scheduler_runtime: Annotation<SchedulerRuntimeState | null>({
    reducer: (_curr, update) => update,
    default: () => null,
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

  // Strategic context injected by Replanner and consumed on the next Planner turn.
  replan_context: Annotation<string | null>({
    reducer: (curr, update) => update,
    default: () => null,
  }),

  // Replanner invocation count used to break retry loops.
  replan_count: Annotation<number>({
    reducer: (curr, update) => update,
    default: () => 0,
  }),

  meta_data: Annotation<Record<string, any>>({
    reducer: (curr, update) => ({ ...curr, ...update }),
    default: () => ({}),
  }),

  // --- Attribution & Task Context ---
  // Pre-generated at agent start so memory node can write attribution records during retrieval.
  task_run_id: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => "",
  }),
  // Set by planner after task type is inferred; used by memory node for L2 contextual lookup.
  task_type: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => "",
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

// Export the state type for node implementations.
export type AgentState = typeof AgentStateAnnotation.State;
