import { useState, useEffect, useRef } from 'react';
import { LlmStepEvent, stepEventTarget } from '../../shared/utils/llm-stream';
import { StepLog } from '../components/StepCard';
import { TraceEvent } from '../../shared/utils/trace';
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
  isDebug?: boolean;
  isPlan?: boolean;
  displayStyle?: 'bubble' | 'inline-status';
};

export type LogMessage = TextLogMessage | StepLog;

export function useAppLogs() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeRecord[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const streamTotalTokensRef = useRef(0);
  const workflowOrderRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<LlmStepEvent>).detail;
      if (ev.type === 'STEP_START') {
        setLogs(prev => [...prev, {
          sender: 'step' as const,
          stepId: ev.stepId,
          node: ev.node,
          model: ev.model,
          status: 'running' as const,
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
          }),
        ]);
      } else if (ev.type === 'STREAM_CHUNK' && ev.delta) {
        setLogs(prev => {
          const idx = [...prev].reverse().findIndex(
            l => l.sender === 'step' && (l as StepLog).stepId === ev.stepId
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          const s = updated[realIdx] as StepLog;
          updated[realIdx] = { ...s, streamContent: s.streamContent + ev.delta };
          return updated;
        });
        setWorkflowNodes((prev) =>
          prev.map((node) =>
            node.stepId === ev.stepId
              ? {
                  ...node,
                  streamContent: `${node.streamContent || ''}${ev.delta || ''}`,
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
    options?: { isDebug?: boolean; isPlan?: boolean; displayStyle?: 'bubble' | 'inline-status' }
  ) => {
    setLogs((prev) => [...prev, {
      sender,
      text,
      isError,
      isSuccess,
      isDebug: options?.isDebug,
      isPlan: options?.isPlan,
      displayStyle: options?.displayStyle,
    }]);
  };

  const beginWorkflowRun = () => {
    workflowOrderRef.current = 0;
    setWorkflowNodes([]);
  };

  const recordWorkflowStep = (step: any) => {
    setWorkflowNodes((prev) => {
      const targetNodeName = step?.node || "unknown";
      const runningIndex = [...prev].reverse().findIndex((node) => {
        if (node.nodeName !== targetNodeName) return false;
        if (node.status === "running") return true;
        return typeof node.stepId === "number";
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
    traceEvents,
    setTraceEvents,
    workflowNodes,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    handleToggleStep,
    clearLogs
  };
}
