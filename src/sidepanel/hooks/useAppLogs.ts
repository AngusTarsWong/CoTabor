import { useState, useEffect, useRef } from 'react';
import { LlmStepEvent, stepEventTarget } from '../../shared/utils/llm-stream';
import { StepLog } from '../components/StepCard';
import {
  WorkflowNodeRecord,
  buildWorkflowNodeFromLlmStart,
  buildWorkflowNodeFromStep,
} from '../components/antx/workflow';

export type RuntimeStats = {
  stepNo: number;
  node: string;
  modelName: string;
  durationMs: number;
  stepTokens: number;
  totalTokens: number;
};

export type TextLogMessage = {
  sender: 'user' | 'agent' | 'system';
  text: string;
  isError?: boolean;
  isSuccess?: boolean;
  displayStyle?: 'inline-status';
};

export type LogMessage = TextLogMessage | StepLog;

export function useAppLogs() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeRecord[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const streamTotalTokensRef = useRef(0);
  const workflowOrderRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<LlmStepEvent>).detail;
      if (ev.scope === 'background') {
        return;
      }
      if (ev.type === 'STEP_START') {
        setLogs(prev => [...prev, {
          sender: 'step' as const,
          stepId: ev.stepId,
          node: ev.node,
          taskRunId: ev.taskRunId,
          model: ev.model,
          status: 'running' as const,
          thinkingContent: '',
          streamContent: '',
          startTime: Date.now(),
          isCollapsed: true,
        } as StepLog]);
        workflowOrderRef.current += 1;
        setWorkflowNodes((prev) => [
          ...prev,
          buildWorkflowNodeFromLlmStart({
            nodeName: ev.node,
            stepId: ev.stepId,
            modelName: ev.model,
            order: workflowOrderRef.current,
            timestamp: Date.now(),
            taskRunId: ev.taskRunId,
          }),
        ]);
      } else if (ev.type === 'STREAM_CHUNK' && ev.delta) {
        const streamChannel = ev.streamChannel ?? 'content';
        setLogs(prev => {
          const idx = [...prev].reverse().findIndex(
            l => l.sender === 'step' && (l as StepLog).stepId === ev.stepId
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          const s = updated[realIdx] as StepLog;
          updated[realIdx] = streamChannel === 'thinking'
            ? { ...s, thinkingContent: `${s.thinkingContent || ''}${ev.delta}` }
            : { ...s, streamContent: s.streamContent + ev.delta };
          return updated;
        });
        setWorkflowNodes((prev) =>
          prev.map((node) =>
            node.stepId === ev.stepId
              ? {
                  ...node,
                  thinkingContent: streamChannel === 'thinking'
                    ? `${node.thinkingContent || ''}${ev.delta || ''}`
                    : node.thinkingContent,
                  streamContent: streamChannel === 'thinking'
                    ? node.streamContent
                    : `${node.streamContent || ''}${ev.delta || ''}`,
                  updatedAt: Date.now(),
                }
              : node
          )
        );
      } else if (ev.type === 'STEP_END') {
        if (ev.tokens) {
          streamTotalTokensRef.current += ev.tokens.total;
        }
        setLogs(prev => {
          const idx = [...prev].reverse().findIndex(
            l => l.sender === 'step' && (l as StepLog).stepId === ev.stepId
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          updated[realIdx] = {
            ...updated[realIdx] as StepLog,
            taskRunId: ev.taskRunId ?? (updated[realIdx] as StepLog).taskRunId,
            status: ev.error ? 'error' : 'done',
            duration_ms: ev.duration_ms,
            tokens: ev.tokens,
            error: ev.error,
            // Auto-expand failed steps so the error is immediately visible
            isCollapsed: ev.error ? false : (updated[realIdx] as StepLog).isCollapsed,
          };
          return updated;
        });
        setWorkflowNodes((prev) =>
          prev.map((node) =>
            node.stepId === ev.stepId
              ? {
                  ...node,
                  status: ev.error ? 'error' : 'done',
                  durationMs: ev.duration_ms,
                  tokens: ev.tokens?.total,
                  taskRunId: ev.taskRunId ?? node.taskRunId,
                  updatedAt: Date.now(),
                }
              : node
          )
        );
      }
    };
    stepEventTarget.addEventListener('llm-step', handler);
    return () => stepEventTarget.removeEventListener('llm-step', handler);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, workflowNodes]);

  const addLog = (
    sender: 'user' | 'agent' | 'system',
    text: string,
    isError = false,
    isSuccess = false,
    options?: { displayStyle?: 'inline-status' }
  ) => {
    setLogs((prev) => [...prev, {
      sender,
      text,
      isError,
      isSuccess,
      displayStyle: options?.displayStyle,
    }]);
  };

  const beginWorkflowRun = () => {
    workflowOrderRef.current = 0;
    setWorkflowNodes([]);
  };

  const restoreLogsSnapshot = (snapshot: {
    logs: LogMessage[];
    workflowNodes: WorkflowNodeRecord[];
  }) => {
    setLogs(snapshot.logs);
    setWorkflowNodes(snapshot.workflowNodes);
    workflowOrderRef.current = snapshot.workflowNodes.reduce(
      (max, node) => Math.max(max, Number(node.order || 0)),
      0,
    );
  };

  const recordWorkflowStep = (step: any) => {
    setWorkflowNodes((prev) => {
      const targetNodeName = step?.node || "unknown";
      const targetTaskRunId = typeof step?.taskRunId === "string" ? step.taskRunId : undefined;
      const runningIndex = [...prev].reverse().findIndex((node) => {
        if (node.nodeName !== targetNodeName) return false;
        if (targetTaskRunId && node.taskRunId !== targetTaskRunId) return false;
        if (node.status === "running") return true;
        return typeof node.stepId === "number" && (!targetTaskRunId || node.taskRunId === targetTaskRunId);
      });
      const nextNode = buildWorkflowNodeFromStep(step, workflowOrderRef.current + 1);

      if (runningIndex !== -1) {
        const realIndex = prev.length - 1 - runningIndex;
        const updated = [...prev];
        updated[realIndex] = {
          ...updated[realIndex],
          ...nextNode,
          id: updated[realIndex].id,
          stepId: updated[realIndex].stepId,
          order: updated[realIndex].order,
          startedAt: updated[realIndex].startedAt,
          thinkingContent: updated[realIndex].thinkingContent,
          streamContent: updated[realIndex].streamContent,
        };
        return updated;
      }

      workflowOrderRef.current += 1;
      return [...prev, { ...nextNode, order: workflowOrderRef.current }];
    });
  };

  const handleToggleStep = (stepId: number) => {
    setLogs(prev => prev.map(l =>
      l.sender === 'step' && (l as StepLog).stepId === stepId
        ? { ...l as StepLog, isCollapsed: !(l as StepLog).isCollapsed }
        : l
    ));
  };

  const clearLogs = () => {
    setLogs([]);
    setWorkflowNodes([]);
    workflowOrderRef.current = 0;
  };

  return {
    logs,
    setLogs,
    workflowNodes,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    restoreLogsSnapshot,
    handleToggleStep,
    clearLogs
  };
}
