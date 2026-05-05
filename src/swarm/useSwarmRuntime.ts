import { useEffect, useState } from "react";
import type { SandboxRuntimeSnapshot } from "../core/orchestrator/types/ResourceRuntime";
import type { WorkflowNodeRecord } from "../sidepanel/components/antx/workflow";

export interface SwarmRuntimeState {
  snapshot: SandboxRuntimeSnapshot | null;
  workflowNodes: WorkflowNodeRecord[];
}

export function useSwarmRuntime(): SwarmRuntimeState {
  const [snapshot, setSnapshot] = useState<SandboxRuntimeSnapshot | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeRecord[]>([]);

  useEffect(() => {
    chrome.storage.local.get(["swarmRuntimeSnapshot", "swarmWorkflowNodes"]).then((result) => {
      if (result.swarmRuntimeSnapshot) setSnapshot(result.swarmRuntimeSnapshot);
      if (result.swarmWorkflowNodes) setWorkflowNodes(result.swarmWorkflowNodes);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.swarmRuntimeSnapshot?.newValue !== undefined) {
        setSnapshot(changes.swarmRuntimeSnapshot.newValue);
      }
      if (changes.swarmWorkflowNodes?.newValue !== undefined) {
        setWorkflowNodes(changes.swarmWorkflowNodes.newValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return { snapshot, workflowNodes };
}
