import { MemoryCandidate, RawTraceRecord, TaskMemoryCommitInput } from "../../shared/types/memory";

function buildHistoryEvidence(totalHistory: any[] = [], limit: number = 10): string[] {
  return totalHistory.slice(-limit).map((item: any) => {
    const action = item?.action?.type || "unknown";
    const skillName = item?.action?.skill_name ? ` skill=${item.action.skill_name}` : "";
    const summary = item?.step_summary || item?.result?.error || item?.result?.message || "no-summary";
    return `step=${item?.step ?? "?"} action=${action}${skillName} summary=${summary}`;
  });
}

export function extractMemoryCandidates(input: TaskMemoryCommitInput): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const { goal, finalState } = input;
  const buffer = finalState.experience_buffer;
  const totalHistory = finalState.total_history || [];
  const meta = finalState.meta_data || {};
  const pageUrl = typeof meta.url === "string" ? meta.url : "";
  let domain = "";
  let path = "";

  try {
    if (pageUrl) {
      const parsed = new URL(pageUrl);
      domain = parsed.hostname;
      path = parsed.pathname;
    }
  } catch {
    // ignore invalid URL
  }

  if (!buffer && !(finalState.dag_run_id && finalState.subtask_dag)) return candidates;

  const sharedEvidence = buildHistoryEvidence(totalHistory);

  // --- Hive Mind / Swarm Level Experience Extraction ---
  if (finalState.dag_run_id && finalState.subtask_dag) {
    const dag = finalState.subtask_dag;
    const nodeDescriptions = Object.values(dag.nodes || {})
      .map((node: any) => `- ${node.title}: ${node.description || "执行子任务"}`)
      .join("\n");
    const summary = finalState.final_summary || "";
    
    candidates.push({
      id: `swarm_${Date.now()}`,
      source: "task_wisdom",
      text: `蜂群协作策略复盘：\n初始目标：${goal}\n执行计划：\n${nodeDescriptions}\n执行结论：${summary}\n此任务采用并行节点协作完成，建议后续类似任务参考此 DAG 拓扑结构。`,
      goal,
      domain,
      path,
      evidence: sharedEvidence,
    });
  }

  if (!buffer) return candidates;

  buffer.site_insights.forEach((item, index) => {
    if (!item?.content?.trim()) return;
    candidates.push({
      id: `site_${Date.now()}_${index}`,
      source: "site_insight",
      text: item.content.trim(),
      goal,
      domain: item.domain || domain,
      path,
      evidence: sharedEvidence,
    });
  });

  buffer.tool_insights.forEach((item, index) => {
    if (!item?.content?.trim()) return;
    candidates.push({
      id: `tool_${Date.now()}_${index}`,
      source: "tool_insight",
      text: item.content.trim(),
      goal,
      domain,
      path,
      skillName: item.skillName,
      evidence: sharedEvidence,
    });
  });

  buffer.task_wisdom.forEach((item, index) => {
    if (!item?.trim()) return;
    candidates.push({
      id: `task_${Date.now()}_${index}`,
      source: "task_wisdom",
      text: item.trim(),
      goal,
      domain,
      path,
      evidence: sharedEvidence,
    });
  });

  // failure_insights: anti-pattern candidates from failed tasks
  (buffer.failure_insights ?? []).forEach((item, index) => {
    if (!item?.trim()) return;
    candidates.push({
      id: `fail_${Date.now()}_${index}`,
      source: "failure_insight",
      text: item.trim(),
      goal,
      domain,
      path,
      evidence: sharedEvidence,
      isAntiPattern: true,
    });
  });

  return candidates;
}

function buildTraceEvidence(traces: RawTraceRecord[]): string[] {
  return traces.slice(0, 10).map((trace) => {
    const action = trace.actionType || "unknown";
    const skillName = trace.skillName ? ` skill=${trace.skillName}` : "";
    const summary = trace.stepSummary || trace.errorMessage || "no-summary";
    return `step=${trace.stepIndex} action=${action}${skillName} summary=${summary}`;
  });
}

function collectSiteTraceIds(rawTraces: RawTraceRecord[], domain?: string): string[] {
  const normalizedDomain = domain?.trim();
  const matched = normalizedDomain
    ? rawTraces.filter((trace) => trace.domain === normalizedDomain)
    : rawTraces;
  const pool = matched.length > 0 ? matched : rawTraces;
  return pool.map((trace) => trace.traceId);
}

function collectToolTraceIds(rawTraces: RawTraceRecord[], skillName?: string): string[] {
  const normalizedSkill = skillName?.trim();
  const matched = normalizedSkill
    ? rawTraces.filter((trace) => trace.skillName === normalizedSkill)
    : [];
  const pool = matched.length > 0 ? matched : rawTraces.filter((trace) => !!trace.skillName);
  return pool.map((trace) => trace.traceId);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function extractMemoryCandidatesFromTaskArtifacts(
  input: TaskMemoryCommitInput,
  rawTraces: RawTraceRecord[] = [],
): MemoryCandidate[] {
  const candidates = extractMemoryCandidates(input);
  const traceMap = new Map(rawTraces.map((trace) => [trace.traceId, trace]));

  return candidates.map((candidate) => {
    let sourceTraceIds: string[] = [];

    if (candidate.source === "site_insight") {
      sourceTraceIds = collectSiteTraceIds(rawTraces, candidate.domain);
    } else if (candidate.source === "tool_insight") {
      sourceTraceIds = collectToolTraceIds(rawTraces, candidate.skillName);
    } else {
      sourceTraceIds = rawTraces.map((trace) => trace.traceId);
    }

    const matchedTraces = sourceTraceIds
      .map((traceId) => traceMap.get(traceId))
      .filter((trace): trace is RawTraceRecord => !!trace);

    return {
      ...candidate,
      sourceTraceIds: unique(sourceTraceIds),
      evidence: matchedTraces.length > 0 ? buildTraceEvidence(matchedTraces) : candidate.evidence,
    };
  });
}
