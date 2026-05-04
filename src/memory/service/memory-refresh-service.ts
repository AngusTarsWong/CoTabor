import type { Skill } from "../../skills/types.ts";
import { prepareAvailableSkills } from "../retrieval/prepare-available-skills.ts";
import {
  buildExecutorNodeUsage,
  buildPlannerNodeUsage,
  buildReplannerNodeUsage,
  type NodeMemoryUsage,
} from "../retrieval/memory-usage-builder.ts";
import {
  retrieveAndAssembleMemories,
  type RetrievedMemoriesPayload,
} from "../retrieval/retrieve-and-assemble-memories.ts";
import { retrieveL1ItemsByUrl } from "../retrieval/l1-rule-retriever.ts";
import { buildExecutorL1Hints } from "../retrieval/memory-prompt-builder.ts";
import type {
  MemoryConsumer,
  MemoryRefreshContext,
  MemoryRefreshMode,
  MemoryRefreshResult,
  MemoryRefreshState,
  MemoryRefreshTelemetry,
} from "./types.ts";

function normalizeText(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function fingerprintRequest(request: string): string {
  return normalizeText(request).slice(0, 160).toLowerCase();
}

function fingerprintIntent(context: MemoryRefreshContext): string {
  const action = context.plannedAction;
  const intent = normalizeText(action?.intent || action?.description || action?.skillName || action?.type);
  const params = action?.params ? JSON.stringify(action.params) : "";
  return `${intent}::${params}`.slice(0, 240).toLowerCase();
}

function fingerprintSkillSet(skills: Skill[]): string {
  return skills
    .map((skill) => `${skill.name}:${Object.keys(skill.params || {}).sort().join(",")}`)
    .sort()
    .join("|");
}

function buildRefreshKey(input: {
  consumer: MemoryConsumer;
  currentUrl?: string;
  boundTabId?: number;
  taskType?: string;
  skillSetFingerprint: string;
  requestFingerprint: string;
  intentFingerprint: string;
}): string {
  return [
    input.consumer,
    input.currentUrl || "",
    String(input.boundTabId ?? ""),
    input.taskType || "",
    input.skillSetFingerprint,
    input.requestFingerprint,
    input.consumer === "executor" ? input.intentFingerprint : "",
  ].join("::");
}

function hasInvalidationHint(lastErrorContext?: string | null): boolean {
  const text = normalizeText(lastErrorContext).toLowerCase();
  if (!text) return false;
  return [
    "cortex",
    "locate",
    "not locate",
    "element not located",
    "navigation",
    "page changed",
    "tab switched",
    "stale",
    "找不到",
    "页面",
    "跳转",
    "标签页",
    "失效",
  ].some((keyword) => text.includes(keyword));
}

function createEmptyRetrievedMemories(): RetrievedMemoriesPayload {
  return {
    plannerContext: "",
    replannerContext: "",
    executorL1Hints: [],
    l1Items: [],
    l3Items: [],
    antiPatternL3Items: [],
    l2Rules: [],
    l3Matches: undefined,
  };
}

function countMatchedMemories(memory: RetrievedMemoriesPayload) {
  return {
    l1: Array.isArray(memory.l1Items) ? memory.l1Items.length : 0,
    l2: Array.isArray(memory.l2Rules) ? memory.l2Rules.length : 0,
    l3: Array.isArray(memory.l3Items) ? memory.l3Items.length : 0,
  };
}

function enrichUsageWithTelemetry(
  usage: NodeMemoryUsage,
  telemetry: MemoryRefreshTelemetry
): NodeMemoryUsage {
  return {
    ...usage,
    refresh: {
      refreshed: telemetry.refreshed,
      mode: telemetry.refreshMode,
      consumer: telemetry.consumer,
      reason: telemetry.reason,
      staleReasons: telemetry.staleReasons,
    },
  };
}

function buildUsageForConsumer(
  consumer: MemoryConsumer,
  memory: RetrievedMemoriesPayload,
  context: MemoryRefreshContext
): NodeMemoryUsage {
  if (consumer === "planner") {
    return buildPlannerNodeUsage({
      plannerContext: memory.plannerContext,
      l2Rules: memory.l2Rules,
    });
  }
  if (consumer === "replanner") {
    return buildReplannerNodeUsage({
      replannerContext: memory.replannerContext,
      l2Rules: memory.l2Rules,
    });
  }
  return buildExecutorNodeUsage({
    l1Items: memory.l1Items || [],
    intent:
      context.plannedAction?.intent ||
      context.plannedAction?.description ||
      context.plannedAction?.skillName ||
      context.plannedAction?.type,
    currentUrl: context.currentUrl,
    fallbackHints: memory.executorL1Hints || [],
    limit: 3,
  });
}

function decideRefreshMode(input: {
  context: MemoryRefreshContext;
  availableSkills: Skill[];
  existingMemory: RetrievedMemoriesPayload;
  previousState: MemoryRefreshState | null | undefined;
  skillSetFingerprint: string;
  requestFingerprint: string;
  intentFingerprint: string;
}): {
  refreshMode: MemoryRefreshMode;
  staleReasons: string[];
  refreshKey: string;
} {
  const staleReasons: string[] = [];
  const existing = input.existingMemory;
  const previous = input.previousState;
  const refreshKey = buildRefreshKey({
    consumer: input.context.consumer,
    currentUrl: input.context.currentUrl,
    boundTabId: input.context.boundTabId,
    taskType: input.context.taskType,
    skillSetFingerprint: input.skillSetFingerprint,
    requestFingerprint: input.requestFingerprint,
    intentFingerprint: input.intentFingerprint,
  });

  if (!previous) staleReasons.push("missing_refresh_state");
  if (!input.context.currentUrl) staleReasons.push("missing_url");
  if ((input.context.existingMemorySnapshot.availableSkills || []).length === 0) staleReasons.push("missing_available_skills");
  if (previous?.lastUrl !== input.context.currentUrl) staleReasons.push("url_changed");
  if (previous?.lastBoundTabId !== input.context.boundTabId) staleReasons.push("bound_tab_changed");
  if ((previous?.lastTaskType || "") !== (input.context.taskType || "")) staleReasons.push("task_type_changed");
  if ((previous?.lastSkillSetFingerprint || "") !== input.skillSetFingerprint) staleReasons.push("skill_set_changed");
  if ((previous?.lastRequestFingerprint || "") !== input.requestFingerprint) staleReasons.push("request_changed");

  if (input.context.consumer === "planner") {
    if (!existing.plannerContext) staleReasons.push("missing_planner_context");
    return {
      refreshMode: staleReasons.length > 0 ? "full" : "reuse",
      staleReasons,
      refreshKey,
    };
  }

  if (input.context.consumer === "replanner") {
    if (!existing.replannerContext) staleReasons.push("missing_replanner_context");
    if (input.context.reason === "retry" || input.context.reason === "post_cortex") {
      staleReasons.push(`reason_${input.context.reason}`);
    }
    if (hasInvalidationHint(input.context.lastErrorContext)) {
      staleReasons.push("last_error_context_invalidated");
    }
    return {
      refreshMode: staleReasons.length > 0 ? "full" : "reuse",
      staleReasons,
      refreshKey,
    };
  }

  if (!Array.isArray(existing.l1Items) || existing.l1Items.length === 0) {
    staleReasons.push("missing_executor_l1");
  }
  if ((previous?.lastIntentFingerprint || "") !== input.intentFingerprint) {
    staleReasons.push("intent_changed");
  }

  const fullRefreshReasons = staleReasons.filter((reason) =>
    ["missing_refresh_state", "missing_url", "url_changed", "bound_tab_changed", "skill_set_changed"].includes(reason)
  );

  if (fullRefreshReasons.length > 0) {
    return { refreshMode: "full", staleReasons, refreshKey };
  }
  if (staleReasons.length > 0) {
    return { refreshMode: "partial", staleReasons, refreshKey };
  }
  return { refreshMode: "reuse", staleReasons: [], refreshKey };
}

async function refreshAllLevels(context: MemoryRefreshContext, availableSkills: Skill[]) {
  return retrieveAndAssembleMemories({
    request: context.request,
    currentUrl: context.currentUrl,
    skills: availableSkills,
    taskRunId: context.taskRunId,
    taskType: context.taskType,
  });
}

async function refreshExecutorL1Only(
  context: MemoryRefreshContext,
  availableSkills: Skill[],
  existingMemory: RetrievedMemoriesPayload
): Promise<{ availableSkills: Skill[]; retrievedMemories: RetrievedMemoriesPayload }> {
  const l1Items = await retrieveL1ItemsByUrl(context.currentUrl);
  return {
    availableSkills,
    retrievedMemories: {
      ...existingMemory,
      l1Items,
      executorL1Hints: buildExecutorL1Hints(l1Items),
    },
  };
}

export async function getMemoryRefreshResult(
  context: MemoryRefreshContext
): Promise<MemoryRefreshResult> {
  const previousRefreshState = context.existingMemorySnapshot.memoryRefreshState;
  const canReuseAvailableSkills =
    Boolean(context.availableSkillsInput?.length) &&
    previousRefreshState?.lastUrl === context.currentUrl &&
    previousRefreshState?.lastBoundTabId === context.boundTabId;
  const availableSkills = canReuseAvailableSkills
    ? (context.availableSkillsInput as Skill[])
    : await prepareAvailableSkills(context.currentUrl);

  const skillSetFingerprint = context.skillSetFingerprint || fingerprintSkillSet(availableSkills);
  const requestFingerprint = fingerprintRequest(context.request);
  const intentFingerprint = fingerprintIntent(context);
  const existingMemory = {
    ...createEmptyRetrievedMemories(),
    ...(context.existingMemorySnapshot.retrievedMemories || {}),
  };
  const decision = decideRefreshMode({
    context,
    availableSkills,
    existingMemory,
    previousState: previousRefreshState,
    skillSetFingerprint,
    requestFingerprint,
    intentFingerprint,
  });

  let resolvedAvailableSkills = availableSkills;
  let resolvedMemories = existingMemory;
  let refreshed = false;

  try {
    if (decision.refreshMode === "full") {
      const retrieval = await refreshAllLevels(context, availableSkills);
      resolvedAvailableSkills = retrieval.availableSkills;
      resolvedMemories = retrieval.retrievedMemories;
      refreshed = true;
    } else if (decision.refreshMode === "partial") {
      const retrieval = await refreshExecutorL1Only(context, availableSkills, existingMemory);
      resolvedAvailableSkills = retrieval.availableSkills;
      resolvedMemories = retrieval.retrievedMemories;
      refreshed = true;
    }
  } catch (error) {
    decision.staleReasons.push("retrieval_failed");
    resolvedAvailableSkills =
      context.existingMemorySnapshot.availableSkills && context.existingMemorySnapshot.availableSkills.length > 0
        ? context.existingMemorySnapshot.availableSkills
        : availableSkills;
    resolvedMemories = existingMemory;
    refreshed = false;
  }

  const matchedCounts = countMatchedMemories(resolvedMemories);
  const telemetry: MemoryRefreshTelemetry = {
    refreshed,
    refreshMode: decision.refreshMode,
    consumer: context.consumer,
    reason: context.reason,
    refreshKey: decision.refreshKey,
    matchedCounts,
    staleReasons: decision.staleReasons,
  };

  const usage = enrichUsageWithTelemetry(
    buildUsageForConsumer(context.consumer, resolvedMemories, context),
    telemetry
  );

  const previous = previousRefreshState || null;
  const refreshState: MemoryRefreshState = {
    lastRefreshAt: Date.now(),
    lastRefreshKey: decision.refreshKey,
    plannerKey: context.consumer === "planner" ? decision.refreshKey : previous?.plannerKey,
    replannerKey: context.consumer === "replanner" ? decision.refreshKey : previous?.replannerKey,
    executorKey: context.consumer === "executor" ? decision.refreshKey : previous?.executorKey,
    lastUrl: context.currentUrl,
    lastBoundTabId: context.boundTabId,
    lastTaskType: context.taskType,
    lastSkillSetFingerprint: skillSetFingerprint,
    lastIntentFingerprint: intentFingerprint,
    lastRequestFingerprint: requestFingerprint,
    lastMode: decision.refreshMode,
  };

  return {
    statePatch: {
      retrieved_memories: resolvedMemories,
      available_skills: resolvedAvailableSkills,
      node_memory_usage: usage,
      memory_refresh_state: refreshState,
    },
    telemetry,
    snapshot: {
      retrievedMemories: resolvedMemories,
      availableSkills: resolvedAvailableSkills,
      nodeMemoryUsage: usage,
      memoryRefreshState: refreshState,
    },
  };
}
