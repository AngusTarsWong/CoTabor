# Agent State Machine and Background Experience Job

English | [简体中文](../zh-CN/agent-state-machine-and-experience-job.md)

## 1. Goals

This design addresses three problems:

1. The semantics of "single-step failure" and "whole-run terminal failure" are mixed together.
2. Background experience summarization has already been made asynchronous, but its event stream still leaks into the main workflow UI.
3. The workflow UI depends too heavily on LLM steps, which causes system nodes such as `executor` and `watchdog(rule_based)` to disappear.

Design goals:

- Release the input box immediately after the main task completes so the user can start the next turn.
- Run experience summarization as an independent background task without blocking task delivery.
- Show only the main-chain nodes in the primary workflow, while the background experience task is shown as lightweight status.
- Write the final `finish` result back to the result message box in a stable way.

---

## 2. State-Machine Constraints

### 2.1 Main-task terminal states

The main task layer recognizes only three terminal states:

- `FINISHED`
- `FAILED`
- `STOPPED`

Only after entering one of these states may `ClawAgent`:

- stop consuming the graph stream
- perform task finalization
- trigger `onFinish`, `onError`, or `onStopped`
- schedule the background experience task

### 2.2 Single-step failure is not a terminal state

A technical failure in `executor` means only:

- the current action failed
- the result must be audited by `watchdog`
- the system then decides whether to recover through `cortex`, replan through `replanner`, or end in final failure

Therefore:

- a normal `executor` failure must not directly set the main state to `FAILED`
- the task should remain in a running state, while the error is written into `error` and `total_history`
- final termination must be decided by `watchdog`, `cortex`, `replanner`, and the graph routing

### 2.3 Where `finish` really lands

When `planner` or `replanner` emits `action.type === "finish"`, it only means:

- the model recommends ending the task

Actual task completion should be finalized in `executor`:

- `executor` handles `finish`
- it returns `status = "FINISHED"`
- the graph then terminates based on that terminal state

This avoids:

- `planner` marking the task as `FINISHED` too early
- `ClawAgent._processStream()` ending prematurely and losing downstream node results

---

## 3. Main Task Chain and Background Experience Chain

### 3.1 Responsibilities of the main task chain

The main task chain is responsible only for:

1. `memory`
2. `planner`
3. `executor`
4. `watchdog`
5. `cortex`
6. `replanner`
7. returning the final user-facing result

After the main task chain ends:

- write local `task_run`
- write local `raw_trace`
- set `experienceStatus = PENDING`
- schedule the background experience task asynchronously

### 3.2 Responsibilities of the background experience chain

The background experience task is responsible only for:

1. reading `task_run + raw_trace`
2. calling the summarization model to generate an experience summary
3. extracting candidate experiences
4. classifying them as `L1 / L2 / L3 / DROP`
5. writing the final memories to local storage
6. writing `{ id, level, title }` back to `raw_trace.memoryRefs`
7. syncing `TaskRuns / RawTraces`
8. updating `experienceStatus`

The background experience task is not part of the main LangGraph execution chain.

---

## 4. Background Experience Task State

`task_run` maintains the following background-experience state fields:

- `experienceStatus`
  - `PENDING`
  - `RUNNING`
  - `SUCCEEDED`
  - `FAILED`

- `experienceStartedAt`
- `experienceFinishedAt`
- `experienceError`
- `experienceRetryCount`

Sync state is maintained separately:

- `cloudSyncStatus`
  - `pending`
  - `synced`
  - `failed`

These two layers must not be mixed:

- `experienceStatus` represents whether experience distillation completed
- `cloudSyncStatus` represents whether cloud sync completed

### 4.1 RawTraces as the audit layer

`raw_trace` remains in local IndexedDB as the raw evidence layer, while a structured summary is also synced to Notion:

- keep the full `raw` payload locally
- sync only a structured summary to the cloud, not the complete raw JSON

Each `raw_trace` adds:

- `memoryRefs`
  - `id`
  - `level`
  - `title`

This allows the system to answer:

- which raw steps existed in this task
- which raw steps eventually produced final memories
- which traces produced a specific `L1 / L2 / L3`

On the Notion side, add:

- `CoTabor_RawTraces`

Suggested fields:

- `id`
- `taskRunId`
- `stepIndex`
- `nodeName`
- `actionType`
- `skillName`
- `success`
- `url`
- `domain`
- `path`
- `pageTitle`
- `stepSummary`
- `errorMessage`
- `memoryLevels`
- `memoryIds`
- `memoryTitles`
- `syncStatus`
- `syncError`
- `syncRetryCount`
- `lastSyncAttemptAt`
- `timestamp`
- `syncedAt`
- `updatedAt`

Time-field convention:

- continue using `epoch ms(number)` internally across the app
- use Notion `date` properties in the cloud, encode as ISO datetime when writing, then decode back to `epoch ms` when reading
- do not store dual time fields or timestamp-style Notion columns

---

## 5. Event-Stream Isolation

### 5.1 Main-task events

LLM calls inside the main task use the default `scope = "main"`. These events may enter:

- `useAppLogs`
- `ChatWorkspace`
- `ProcessPanel`

### 5.2 Background-experience events

LLM calls in the background experience task use:

- `scope = "background"`

These events must not enter the main workflow UI.

The background experience task should expose only lightweight status through the `experience-job` event bus:

- `queued`
- `running`
- `completed`
- `failed`

The UI should show only:

- `Experience job queued`
- `Experience summarization in progress...`
- `Experience saved: L1 x · L2 x · L3 x`
- `TaskRuns / RawTraces synced to Notion`
- `Experience summarization failed, waiting for retry`

These states should appear as lightweight status rows rather than strong workflow cards. Clicking the arrow after a status row should open an independent detail drawer showing:

- summary content
- candidate experiences and commit results
- raw model output
- `TaskRuns / RawTraces` sync status

---

## 6. Workflow UI Rules

### 6.1 Display source

Node display in the main workflow card should primarily come from `workflowNodes` written by graph `onStep`.

The purpose of `llm-step` is only to supplement:

- model name
- token usage
- duration
- streaming output

`llm-step` must no longer be the sole source that determines whether a node is visible.

### 6.2 Main-chain nodes that must always remain visible

If executed, the following nodes must remain visible:

- `memory`
- `planner`
- `executor`
- `watchdog`
- `cortex`
- `replanner`
- `human`

They must not disappear from the UI even if they have no LLM events.

### 6.3 Background experience tasks must not enter the main workflow

`experience_job` should no longer appear in:

- `Agent workflow`
- `ProcessPanel`
- the main task node tree

If experience details need to be inspected later, bind them to:

- `task_run`
- or the background experience task result object

Do not bind them to main workflow nodes anymore.

---

## 7. Final Result Message Box

The final result message box should be generated only at a true terminal state:

- `FINISHED` -> `onFinish`
- `FAILED` -> `onError`
- `STOPPED` -> `onStopped`

Priority of the user-visible final result text:

1. `planner_output.action.result`
2. the `finish` result in `total_history`
3. the most recent valid `step_summary`

If the model only emitted an intermediate `finish` suggestion but the main task has not truly completed, the final result message box must not be filled early.

---

## 8. Future Extension Suggestions

If we keep evolving this architecture, recommended next steps are:

1. Add an independent details panel for background experience tasks and read directly from `task_run`
2. Upgrade `raw_trace` from "flush once at the end" to "persist incrementally while running"
3. Add finer-grained audit fields to `TaskRuns`
4. Upgrade workflow round segmentation from log-driven logic to node-tree-driven logic
5. Use `RawTraces` for daily offline review and experience reruns

---

## 9. Three-Layer Memory Retrieval Strategy

### 9.1 Overall principles

The three memory layers no longer share one retrieval strategy:

- `L1`: structured exact retrieval
- `L2`: structured rule retrieval
- `L3`: BM25 plus structured field filtering/reranking

The current version has removed:

- cloud embedding generation
- local vector index
- vector-dimension initialization and rebuild flows

### 9.2 Relationship between L1 / L2 / L3 and RawTraces

- `L1`: distilled from page-operation-related traces
- `L2`: distilled from skill/tool invocation traces
- `L3`: distilled from task-level strategies and multi-step traces

Each candidate experience carries `sourceTraceIds` before entering the classifier.  
After a final memory is successfully written, `{ id, level, title }` is written back to the corresponding `raw_trace.memoryRefs`.

This forms a complete chain:

- `TaskRun`
  -> `RawTraces`
  -> `L1 / L2 / L3`

This makes auditing, reruns, and quality analysis easier later.

### 9.3 Memory injection path at task start

At task start, the main chain first enters `memoryNode`, which performs unified retrieval and formatting for all three memory layers:

- `L1`: structured exact retrieval by `domain + path`
- `L2`: structured rule retrieval by `skillName`
- `L3`: BM25 retrieval by `request + domainScope + language`

`memoryNode` no longer stores everything as a single `rag_context`. Instead, it outputs structured fields:

- `retrieved_memories.plannerContext`
- `retrieved_memories.replannerContext`
- `retrieved_memories.executorL1Hints`
- `retrieved_memories.l1Rules`

Usage rules:

- `planner`: inject `plannerContext`
- `replanner`: inject `replannerContext`
- `executor`: inject L1 execution hints only on the `ui_interact` path

The `executor` L1 hints are not a fixed top-N list. The flow is:

- read `retrieved_memories.l1Rules`
- run local BM25 relevance filtering based on the current `ui_interact.intent`
- rerank lightly using URL/path match and historical success rate
- if nothing survives, fall back to `executorL1Hints`

This makes the boundaries of the three memory layers:

- `L1`: serves both strategy and execution layers
- `L2`: enhances the planner through skill descriptions
- `L3`: serves only the strategy layer and does not enter the executor directly

This reduces:

- extension size and review complexity
- runtime initialization failure risk
- memory-system debugging complexity

### 9.2 L1 retrieval

L1 remains page-operation experience:

- match keys: `domain + pathPattern + actionType + elementSelector`
- ranking: path match quality + execution count + success rate

L1 does not use BM25 because it is a rule hit problem, not natural-language semantic recall.

### 9.3 L2 retrieval

L2 remains skill / API / MCP invocation rules:

- match keys: `skillName + ruleType + contextScope`
- ranking: hit count + success count + update time

L2 also does not use BM25. It is better suited to rule matching and field-level enhancement.

### 9.4 L3 retrieval

L3 becomes:

- primary storage: `IndexedDB / l3_tactical`
- retrieval engine: `wink-bm25-text-search`
- indexed fields:
  - `title`
  - `keywords`
  - `intentQuery`
  - `tacticalRules`
- rerank fields:
  - `taskType`
  - `domainScope`
  - `language`
  - `usageCount`
  - `successCount`
  - `updatedAt`

L3 no longer depends on embeddings or vector indexes.

### 9.5 L3 preprocessing strategy

L3 queries and documents both go through a lightweight preprocessing layer:

1. Text normalization
- Unicode `NFKC`
- lowercasing
- removing URLs, excessive whitespace, and punctuation noise

2. Language grouping
- `latin`
- `cjk`
- `other`

3. Tokenization
- `latin`: word splitting
- `cjk`: unigram + bigram
- `other`: simple splitting / character-level fallback

The first version does not introduce heavy tokenizers or language models.

### 9.6 L3 index lifecycle

The L3 BM25 index is an in-memory index within the current session:

- async `warmup()` when the sidepanel starts
- `ensureReady()` before retrieval
- `rebuild()` after local L3 writes
- `rebuild()` after cloud L3 pullback

Compared with the old vector approach:

- there is no embedding dimension constraint
- there is no model download or vectorization bootstrap
- only BM25/indexedDB consistency must be maintained

### 9.7 Experience output requirements

To preserve BM25 quality, the background experience task should fill in these `L3` fields as much as possible:

- `title`
- `taskType`
- `domainScope`
- `language`
- `keywords`
- `tacticalRules`

If the model fails to provide them:

- `keywords` falls back to locally generated preprocessing output
- `language` falls back to script-level detection

This document should be maintained in sync with:

- `src/lib/claw/agent.ts`
- `src/core/graph/graph.ts`
- `src/core/graph/nodes/*`
- `src/memory/experience-job/*`
- `src/memory/retrieval/*`
- `src/sidepanel/hooks/useAppLogs.ts`
- `src/sidepanel/components/antx/ChatWorkspace.tsx`
