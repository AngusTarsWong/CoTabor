import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowNodeRecord } from "../components/antx/workflow";
import type { LogMessage } from "./useAppLogs";

const SNAPSHOT_KEY = "cotabor:lastSidepanelSessionSnapshot";
const SNAPSHOT_VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

export interface SidepanelSessionSnapshot {
  version: number;
  savedAt: number;
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  agentGoal: string;
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  sessionLocked: boolean;
  wasRunning: boolean;
  wasStopping: boolean;
}

export interface SidepanelSessionSnapshotSummary {
  savedAt: number;
  boundTabTitle?: string;
  boundTabUrl?: string;
  messageCount: number;
  nodeCount: number;
  draftGoal?: string;
  wasRunning: boolean;
  wasStopping: boolean;
}

function hasMeaningfulContent(input: {
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  agentGoal: string;
}) {
  return input.logs.length > 0 || input.workflowNodes.length > 0 || input.agentGoal.trim().length > 0;
}

export function validateSidepanelSessionSnapshot(value: unknown): SidepanelSessionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<SidepanelSessionSnapshot>;
  if (snapshot.version !== SNAPSHOT_VERSION) return null;
  if (typeof snapshot.savedAt !== "number") return null;
  if (!Array.isArray(snapshot.logs)) return null;
  if (!Array.isArray(snapshot.workflowNodes)) return null;

  return {
    version: SNAPSHOT_VERSION,
    savedAt: snapshot.savedAt,
    logs: snapshot.logs as LogMessage[],
    workflowNodes: snapshot.workflowNodes as WorkflowNodeRecord[],
    agentGoal: typeof snapshot.agentGoal === "string" ? snapshot.agentGoal : "",
    boundTabId: typeof snapshot.boundTabId === "number" ? snapshot.boundTabId : null,
    boundTabTitle: typeof snapshot.boundTabTitle === "string" ? snapshot.boundTabTitle : "",
    boundTabUrl: typeof snapshot.boundTabUrl === "string" ? snapshot.boundTabUrl : "",
    sessionLocked: snapshot.sessionLocked === true || typeof snapshot.boundTabId === "number",
    wasRunning: snapshot.wasRunning === true,
    wasStopping: snapshot.wasStopping === true,
  };
}

function buildSummary(snapshot: SidepanelSessionSnapshot): SidepanelSessionSnapshotSummary {
  return {
    savedAt: snapshot.savedAt,
    boundTabTitle: snapshot.boundTabTitle,
    boundTabUrl: snapshot.boundTabUrl,
    messageCount: snapshot.logs.filter((log) => log.sender !== "step").length,
    nodeCount: snapshot.workflowNodes.length,
    draftGoal: snapshot.agentGoal.trim() || undefined,
    wasRunning: snapshot.wasRunning,
    wasStopping: snapshot.wasStopping,
  };
}

export function useSidepanelSessionSnapshot(input: {
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  agentGoal: string;
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  sessionLocked: boolean;
  isAgentRunning: boolean;
  isAgentStopping: boolean;
}) {
  const [snapshot, setSnapshot] = useState<SidepanelSessionSnapshot | null>(null);
  const snapshotRef = useRef<SidepanelSessionSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get(SNAPSHOT_KEY).then((result) => {
      if (cancelled) return;
      const validated = validateSidepanelSessionSnapshot(result[SNAPSHOT_KEY]);
      setSnapshot(validated);
      if (result[SNAPSHOT_KEY] && !validated) {
        chrome.storage.local.remove(SNAPSHOT_KEY).catch(() => {});
      }
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!hasMeaningfulContent(input)) return;
    if (
      input.logs.length === 0 &&
      input.workflowNodes.length === 0 &&
      input.agentGoal.trim().length > 0 &&
      snapshotRef.current &&
      (snapshotRef.current.logs.length > 0 || snapshotRef.current.workflowNodes.length > 0)
    ) {
      return;
    }

    const nextSnapshot: SidepanelSessionSnapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      logs: input.logs,
      workflowNodes: input.workflowNodes,
      agentGoal: input.agentGoal,
      boundTabId: input.boundTabId,
      boundTabTitle: input.boundTabTitle,
      boundTabUrl: input.boundTabUrl,
      sessionLocked: input.sessionLocked,
      wasRunning: input.isAgentRunning,
      wasStopping: input.isAgentStopping,
    };

    const timer = window.setTimeout(() => {
      chrome.storage.local.set({ [SNAPSHOT_KEY]: nextSnapshot }).then(() => {
        setSnapshot(nextSnapshot);
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    loaded,
    input.logs,
    input.workflowNodes,
    input.agentGoal,
    input.boundTabId,
    input.boundTabTitle,
    input.boundTabUrl,
    input.sessionLocked,
    input.isAgentRunning,
    input.isAgentStopping,
  ]);

  const summary = useMemo(() => snapshot ? buildSummary(snapshot) : null, [snapshot]);

  const clearSnapshot = async () => {
    await chrome.storage.local.remove(SNAPSHOT_KEY);
    setSnapshot(null);
  };

  return {
    snapshot,
    summary,
    loaded,
    clearSnapshot,
  };
}
