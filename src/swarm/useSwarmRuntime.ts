import { useEffect, useState } from "react";
import type { SandboxRuntimeSnapshot } from "../core/orchestrator/types/ResourceRuntime";
import type { WorkflowNodeRecord } from "../sidepanel/components/antx/workflow";

export interface SwarmRuntimeState {
  snapshot: SandboxRuntimeSnapshot | null;
  workflowNodes: WorkflowNodeRecord[];
  launchRequest: any | null;
}

export function useSwarmRuntime(): SwarmRuntimeState {
  const [snapshot, setSnapshot] = useState<SandboxRuntimeSnapshot | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeRecord[]>([]);
  const [launchRequest, setLaunchRequest] = useState<any | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["swarmRuntimeSnapshot", "swarmWorkflowNodes", "swarmLaunchRequest"]).then((result) => {
      if (result.swarmRuntimeSnapshot !== undefined) setSnapshot(result.swarmRuntimeSnapshot);
      if (result.swarmWorkflowNodes !== undefined) setWorkflowNodes(result.swarmWorkflowNodes);
      if (result.swarmLaunchRequest !== undefined) setLaunchRequest(result.swarmLaunchRequest);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.swarmRuntimeSnapshot) {
        setSnapshot(changes.swarmRuntimeSnapshot.newValue || null);
      }
      if (changes.swarmWorkflowNodes) {
        setWorkflowNodes(changes.swarmWorkflowNodes.newValue || []);
      }
      if (changes.swarmLaunchRequest) {
        setLaunchRequest(changes.swarmLaunchRequest.newValue || null);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return { snapshot, workflowNodes, launchRequest };
}
