import { MemoryCandidate, TaskMemoryCommitInput } from "../../shared/types/memory";

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

  if (!buffer) return candidates;

  const sharedEvidence = buildHistoryEvidence(totalHistory);

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

  return candidates;
}
