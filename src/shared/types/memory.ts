/**
 * CoTabor Unified Memory Types
 * All memory is stored as MemoryItem in agent_memory_nodes.
 */

export type MemoryLevel = 'L1' | 'L2' | 'L3';

// ─────────────────────────────────────────────────────────────────────────────
// Unified MemoryItem — the single physical record in agent_memory_nodes.
// L1_HINT / L2_RULE / L3_WORKFLOW are logical subtypes via `type`.
// ─────────────────────────────────────────────────────────────────────────────
export type MemoryItemType = 'L1_HINT' | 'L2_RULE' | 'L3_WORKFLOW';

export interface MemoryItem {
  /** Globally unique ID. Prefixes: hint_ (L1), rule_ (L2), wf_ (L3) */
  id: string;
  type: MemoryItemType;

  /**
   * Primary retrieval text — used by BM25 full-text search.
   * L1: physicalInstruction summary
   * L2: parameterRules text
   * L3: memoryTitle + tacticalRules concatenated
   */
  content: string;

  /** Short human-readable title shown in memory browser UI */
  title: string;

  /**
   * Hard-filter tags for pre-filtering before BM25.
   * Common tags: domain:<hostname>, skill:<skillName>, taskType:<type>
   */
  tags: string[];

  /** Ebbinghaus stability factor (days). Init=2, grows ×1.5 per hit, capped at 90. */
  stability: number;

  /** Unix ms of last retrieval hit — used by Ebbinghaus decay curve */
  lastAccessedAt: number;

  createdAt: number;
  updatedAt: number;

  /**
   * Subtype-specific payload preserved verbatim.
   * Do NOT add retrieval-critical fields here — keep them in the top-level fields above.
   */
  meta: L1HintMeta | L2RuleMeta | L3WorkflowMeta;
}

// ─────────── Subtype meta shapes ───────────

export interface L1HintMeta {
  domain: string;
  pathPattern: string;
  elementSelector: string;
  actionType: string;
  executionCount: number;
  successCount: number;
  /** Physical interaction instruction (JSON string or plain text) */
  physicalInstruction: string;
  reason?: string;
}

export interface L2RuleMeta {
  skillName: string;
  ruleType?: string;
  contextScope?: string;
  ruleScope?: 'base' | 'contextual';
  parameterRules: string;
  errorHistory?: string;
  hitCount?: number;
  successCount?: number;
  status: 'active' | 'archived' | 'needs_review';
}

export interface L3WorkflowMeta {
  intentQuery: string;
  taskType?: string;
  domainScope?: string;
  language?: string;
  keywords?: string[];
  tacticalRules: string;
  usageCount?: number;
  successCount?: number;
  relatedMemoryIds?: string[];
  /** 'positive' = success pattern, 'anti_pattern' = failure lesson to avoid */
  memoryType?: 'positive' | 'anti_pattern';
  
  /** 
   * Origin of the strategy: 
   * 'agent' = single-agent tactical path
   * 'swarm' = orchestrator-level multi-agent coordination pattern
   */
  sourceType?: 'agent' | 'swarm';
  
  /** 
   * For swarm-level strategies, stores the observed DAG structure summary.
   */
  dagPattern?: {
    nodes: Array<{ intent: string; role?: string }>;
    dependencies: string; // e.g., "A -> B, C; B, C -> D"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Score breakdown for L3 retrieval (debug / A-B testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface L3ScoreBreakdown {
  bm25: number;
  domainBonus: number;
  taskTypeBonus: number;
  languageBonus: number;
  successBonus: number;
  usageBonus: number;
  retentionBonus: number;
  cosine?: number;
}

/** A ranked L3 retrieval result carrying the MemoryItem and score info. */
export interface L3RetrievalMatch {
  memory: MemoryItem;
  score: number;
  scoreBreakdown: L3ScoreBreakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Queue
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncQueueEntry {
  id: string;
  action: 'insert' | 'update' | 'delete';
  memoryLevel: MemoryLevel;
  targetId: string;
  payload: any;
  queuedAt: number;
  retryCount?: number;
  status?: 'pending' | 'failed';
  lastError?: string;
  lastAttemptAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Experience / Distillation pipeline types
// ─────────────────────────────────────────────────────────────────────────────

export interface RawExperienceTrace {
  id: string;
  memoryLevel: MemoryLevel;
  /** 'AGENT' for tactical details, 'ORCHESTRATOR' for DAG/Swarm strategic paths */
  source?: 'AGENT' | 'ORCHESTRATOR';
  context: Record<string, any>;
  suggestedCorrection: string | Record<string, any>;
  success: boolean;
  timestamp: number;
}

export interface TaskExperienceBuffer {
  site_insights: Array<{ domain: string; content: string }>;
  tool_insights: Array<{ skillName: string; content: string }>;
  task_wisdom: Array<string>;
  failure_insights?: Array<string>;
}

export interface MemoryCandidate {
  id: string;
  source: 'site_insight' | 'tool_insight' | 'task_wisdom' | 'history_fallback' | 'failure_insight';
  text: string;
  goal: string;
  domain?: string;
  path?: string;
  skillName?: string;
  evidence?: string[];
  sourceTraceIds?: string[];
  isAntiPattern?: boolean;
}

export interface ClassifiedMemory {
  candidateId: string;
  level: MemoryLevel | 'DROP';
  title: string;
  memoryText: string;
  reason: string;
  confidence: number;
  keywords?: string[];
  language?: string;
  domainScope?: string;
  scope: {
    domain?: string;
    path?: string;
    skillName?: string;
    taskType?: string;
  };
  memoryType?: 'positive' | 'anti_pattern';
  
  /** 
   * Origin of the strategy: 
   * 'agent' = single-agent tactical path
   * 'swarm' = orchestrator-level multi-agent coordination pattern
   */
  sourceType?: 'agent' | 'swarm';
  
  /** 
   * For swarm-level strategies, stores the observed DAG structure summary.
   */
  dagPattern?: {
    nodes: Array<{ intent: string; role?: string }>;
    dependencies: string; 
  };
}

export interface MemoryRefRecord {
  id: string;
  level: MemoryLevel;
  title: string;
  memoryText?: string;
}

export interface CommittedMemoryDetail {
  id: string;
  level: MemoryLevel;
  title: string;
  memoryText: string;
}

export type MemoryDetailConsumer = 'planner' | 'replanner' | 'executor';

export interface NodeMemoryDetailItem {
  id?: string;
  level: MemoryLevel;
  title: string;
  summary: string;
  fullText: string;
  injectedText: string;
  injectionSurface: string;
  sourceMeta?: Record<string, unknown>;
  memoryType?: 'positive' | 'anti_pattern';
}

export interface NodeMemoryDetails {
  consumer: MemoryDetailConsumer;
  refresh?: {
    refreshed?: boolean;
    mode?: 'reuse' | 'partial' | 'full';
    reason?: string;
    staleReasons?: string[];
  };
  items: NodeMemoryDetailItem[];
}

export interface ExperienceSyncItemStatus {
  status: 'pending' | 'synced' | 'failed';
  error?: string;
}

export interface ExperienceSyncDetails {
  taskRuns: ExperienceSyncItemStatus;
  rawTraces: ExperienceSyncItemStatus & {
    syncedCount?: number;
    failedCount?: number;
    pendingCount?: number;
  };
  notionSync?: ExperienceSyncItemStatus & {
    issues?: string[];
  };
}

export interface TaskMemoryCommitInput {
  goal: string;
  finalState: {
    task_run_id?: string;
    total_history?: any[];
    long_term_memory?: { summary?: string };
    experience_buffer?: TaskExperienceBuffer;
    meta_data?: Record<string, any>;
    status?: string;
    planner_output?: { action?: Record<string, any> };
    
    // Support for Orchestrator-level reporting
    dag_run_id?: string;
    subtask_dag?: any;
    scheduler_runtime?: any;
    dag_execution_mode?: string;
    final_summary?: string;
  };
}

export interface TaskMemoryCommitResult {
  taskRunId?: string;
  taskRunSynced?: boolean;
  scheduled?: boolean;
  experienceStatus?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  candidates: number;
  committedMemories?: CommittedMemoryDetail[];
  syncDetails?: ExperienceSyncDetails;
  committed: {
    L1: number;
    L2: number;
    L3: number;
    DROP: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw trace / task run records (infrastructure layer)
// ─────────────────────────────────────────────────────────────────────────────

export interface RawTraceRecord {
  traceId: string;
  taskRunId: string;
  runScope?: 'ROOT' | 'DAG_NODE';
  dagRunId?: string;
  dagNodeId?: string;
  dagNodeTitle?: string;
  dagExecutionMode?: string;
  sandboxTabId?: number;
  timestamp: number;
  stepIndex: number;
  nodeName?: string;
  actionType?: string;
  skillName?: string;
  success?: boolean;
  url?: string;
  domain?: string;
  path?: string;
  pageTitle?: string;
  stepSummary?: string;
  errorMessage?: string;
  memoryRefs?: MemoryRefRecord[];
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string;
  syncRetryCount?: number;
  lastSyncAttemptAt?: number;
  syncedAt?: number;
  updatedAt?: number;
  raw: any;
}

export interface MemoryWriteResult {
  level: MemoryLevel | 'DROP';
  ref?: MemoryRefRecord;
}

/** Semantic relationship type between two L3 memories in the knowledge graph. */
export type MemoryRelation =
  | 'refines'
  | 'extends'
  | 'contradicts'
  | 'co_occurs'
  | 'prerequisite';

export interface MemoryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: MemoryRelation;
  weight: number;
  coOccurrenceCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryAttributionRecord {
  id: string;
  taskRunId: string;
  memoryId: string;
  memoryLevel: MemoryLevel;
  retrievedAt: number;
  taskOutcome?: 'FINISHED' | 'FAILED';
}

export interface TaskRunRecord {
  id: string;
  goal: string;
  status: string;
  /** 
   * 'ROOT' = standard single-agent run
   * 'DAG_NODE' = sub-agent run within a swarm
   * 'DAG_ROOT' = orchestrator-level swarm run 
   */
  runScope?: 'ROOT' | 'DAG_NODE' | 'DAG_ROOT';
  dagRunId?: string;
  dagNodeId?: string;
  dagNodeTitle?: string;
  dagParentNodeIds?: string[];
  dagExecutionMode?: string;
  resourceProfile?: string;
  sandboxGroupId?: number;
  sandboxTabId?: number;
  
  /** For DAG_ROOT, stores the structured execution plan and outcomes */
  subtaskDag?: any;
  schedulerRuntime?: any;

  startedAt: number;
  finishedAt: number;
  hostUrl?: string;
  hostTitle?: string;
  globalSummary?: string;
  traceCount: number;
  candidateCount: number;
  committedL1: number;
  committedL2: number;
  committedL3: number;
  droppedCount: number;
  localPersistStatus: 'saved';
  experienceStatus: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  experienceStartedAt?: number;
  experienceFinishedAt?: number;
  experienceError?: string;
  experienceRetryCount: number;
  cloudSyncStatus: 'pending' | 'synced' | 'failed';
  cloudSyncError?: string;
  syncedAt?: number;
  updatedAt: number;
}
