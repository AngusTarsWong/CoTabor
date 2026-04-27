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
  const base = subtask.description ?? subtask.title;
  if (!dag || subtask.dependsOn.length === 0) return base;

  const predecessorContext = subtask.dependsOn
    .map((depId) => {
      const dep = dag.nodes[depId];
      if (!dep?.outputRef?.summary) return null;
      return `[${dep.title}]: ${dep.outputRef.summary}`;
    })
    .filter(Boolean)
    .join("\n");

  if (!predecessorContext) return base;
  return `${base}\n\n前置任务输出摘要（供参考）：\n${predecessorContext}`;
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
