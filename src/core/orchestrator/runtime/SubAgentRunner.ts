import { AgentConfig, ClawAgent } from "../../../lib/claw/agent";
import { SubtaskNode } from "../types/SubtaskDag";

export interface SubAgentRunResult {
  success: boolean;
  finalState?: any;
  error?: Error;
}

export async function runSubAgentTask(
  subtask: SubtaskNode,
  configFactory: (subtask: SubtaskNode) => AgentConfig,
): Promise<SubAgentRunResult> {
  const baseConfig = configFactory(subtask);

  return await new Promise<SubAgentRunResult>((resolve) => {
    const agent = new ClawAgent({
      ...baseConfig,
      goal: subtask.title,
      onFinish: (result) => {
        baseConfig.onFinish?.(result);
        resolve({ success: true, finalState: result });
      },
      onError: (error) => {
        baseConfig.onError?.(error);
        resolve({ success: false, error: error instanceof Error ? error : new Error(String(error)) });
      },
      onStopped: (result) => {
        baseConfig.onStopped?.(result);
        resolve({ success: false, finalState: result, error: new Error("Sub-agent stopped") });
      },
    });

    agent.start().catch((error) => {
      resolve({ success: false, error: error instanceof Error ? error : new Error(String(error)) });
    });
  });
}
