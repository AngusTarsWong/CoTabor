import { AgentConfig, ClawAgent } from "../../../lib/claw/agent";
import { SubtaskNode, SubtaskDag } from "../types/SubtaskDag";

export interface SubAgentRunResult {
  success: boolean;
  finalState?: any;
  error?: Error;
}

export interface RunSubAgentTaskOptions {
  forwardLifecycleCallbacks?: boolean;
}

/** Build the goal string for a subtask, injecting predecessor output summaries for dependent tasks. */
function buildSubtaskGoal(subtask: SubtaskNode, dag?: SubtaskDag): string {
  const originalTaskInput = subtask.metadata?.originalTaskInput as
    | { goal?: string; description?: string }
    | undefined;
  const base =
    subtask.description ??
    originalTaskInput?.goal ??
    originalTaskInput?.description ??
    subtask.title;
  const replayDependencyContext = Array.isArray(subtask.metadata?.replayDependencyContext)
    ? subtask.metadata.replayDependencyContext
    : [];
  const targetUrl =
    typeof subtask.metadata?.targetUrl === "string" && subtask.metadata.targetUrl.trim()
      ? subtask.metadata.targetUrl.trim()
      : undefined;
  const sourceSite =
    typeof subtask.metadata?.sourceSite === "string" && subtask.metadata.sourceSite.trim()
      ? subtask.metadata.sourceSite.trim()
      : undefined;
  const resourceProfile =
    typeof subtask.metadata?.resourceProfile === "string" ? subtask.metadata.resourceProfile : undefined;

  const executionHints: string[] = [];
  if (sourceSite) {
    executionHints.push(`来源站点：${sourceSite}`);
  }
  if (targetUrl) {
    executionHints.push(`目标页面：${targetUrl}`);
  }
  if (resourceProfile === "page_read" || resourceProfile === "page_write") {
    executionHints.push("优先基于当前已打开页面完成任务；仅当当前页面明显不是目标站点时再重新导航。");
  }

  if ((!dag || subtask.dependsOn.length === 0) && replayDependencyContext.length === 0 && executionHints.length === 0) {
    return base;
  }

  const predecessorLines = [
    ...subtask.dependsOn.map((depId) => {
      const dep = dag.nodes[depId];
      if (!dep?.outputRef?.summary) return null;
      return `[${dep.title}]: ${dep.outputRef.summary}`;
    }),
    ...replayDependencyContext.map((item: any) => {
      if (!item || typeof item.summary !== "string" || !item.summary.trim()) return null;
      const title = typeof item.title === "string" && item.title.trim() ? item.title : item.id || "依赖节点";
      return `[${title}]: ${item.summary.trim()}`;
    }),
  ].filter(Boolean);

  const sections = [base];
  if (executionHints.length > 0) {
    sections.push(`执行上下文：\n${executionHints.join("\n")}`);
  }
  if (predecessorLines.length > 0) {
    sections.push(`前置任务输出摘要（供参考）：\n${predecessorLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export async function runSubAgentTask(
  subtask: SubtaskNode,
  configFactory: (subtask: SubtaskNode) => AgentConfig,
  dag?: SubtaskDag,
  options: RunSubAgentTaskOptions = {},
): Promise<SubAgentRunResult> {
  const baseConfig = configFactory(subtask);
  const forwardLifecycleCallbacks = options.forwardLifecycleCallbacks ?? true;

  return await new Promise<SubAgentRunResult>((resolve) => {
    const agent = new ClawAgent({
      ...baseConfig,
      goal: buildSubtaskGoal(subtask, dag),
      onFinish: (result) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onFinish?.(result);
        }
        resolve({ success: true, finalState: result });
      },
      onError: (error) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onError?.(error);
        }
        resolve({ success: false, error: error instanceof Error ? error : new Error(String(error)) });
      },
      onStopped: (result) => {
        if (forwardLifecycleCallbacks) {
          baseConfig.onStopped?.(result);
        }
        resolve({ success: false, finalState: result, error: new Error("Sub-agent stopped") });
      },
    });

    agent.start().catch((error) => {
      resolve({ success: false, error: error instanceof Error ? error : new Error(String(error)) });
    });
  });
}
