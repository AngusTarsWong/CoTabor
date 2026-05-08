import type { SandboxRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";
import type { SandboxTabDriver } from "../../core/orchestrator/runtime/SandboxTabAllocator";
import type { HumanRequest } from "./agent";
import type { ClawAgent } from "./agent";

export interface AgentRuntimeCallbacks {
  onResourceRuntimeUpdate?: (snapshot: SandboxRuntimeSnapshot | null) => void;
  onHumanRequest?: (req: HumanRequest) => void;
  sandboxTabDriver?: SandboxTabDriver;
  tabId: number;
}

const callbackRegistry = new Map<string, AgentRuntimeCallbacks>();
const subAgentRegistry = new Map<string, Set<ClawAgent>>();

export function registerAgentCallbacks(taskRunId: string, callbacks: AgentRuntimeCallbacks): void {
  callbackRegistry.set(taskRunId, callbacks);
}

export function getAgentCallbacks(taskRunId: string): AgentRuntimeCallbacks | undefined {
  return callbackRegistry.get(taskRunId);
}

export function unregisterAgentCallbacks(taskRunId: string): void {
  callbackRegistry.delete(taskRunId);
}

export function registerSubAgent(masterTaskRunId: string, agent: ClawAgent): void {
  if (!subAgentRegistry.has(masterTaskRunId)) {
    subAgentRegistry.set(masterTaskRunId, new Set());
  }
  subAgentRegistry.get(masterTaskRunId)!.add(agent);
}

export function unregisterSubAgent(masterTaskRunId: string, agent: ClawAgent): void {
  subAgentRegistry.get(masterTaskRunId)?.delete(agent);
}

export async function stopAllSubAgents(masterTaskRunId: string): Promise<void> {
  const agents = subAgentRegistry.get(masterTaskRunId);
  if (!agents || agents.size === 0) return;
  await Promise.allSettled([...agents].map((a) => a.stop().catch(() => {})));
  subAgentRegistry.delete(masterTaskRunId);
}
