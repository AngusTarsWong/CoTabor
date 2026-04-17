import { useState, useEffect, useRef } from 'react';
import { LlmStepEvent, stepEventTarget } from '../../shared/utils/llm-stream';
import { StepLog } from '../components/StepCard';
import { TraceEvent } from '../../shared/utils/trace';

export type RuntimeStats = {
  stepNo: number;
  node: string;
  modelName: string;
  durationMs: number;
  stepTokens: number;
  totalTokens: number;
};

export type LogMessage =
  | { sender: 'user' | 'agent' | 'system'; text: string; isError?: boolean; isSuccess?: boolean }
  | StepLog;

export function useAppLogs() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const streamTotalTokensRef = useRef(0);

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
      }
    };
    stepEventTarget.addEventListener('llm-step', handler);
    return () => stepEventTarget.removeEventListener('llm-step', handler);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (sender: 'user' | 'agent' | 'system', text: string, isError = false, isSuccess = false) => {
    setLogs((prev) => [...prev, { sender, text, isError, isSuccess }]);
  };

  const addAgentLogs = (items: string[]) => {
    if (items.length === 0) return;
    setLogs((prev) => [...prev, ...items.map(text => ({ sender: 'agent' as const, text }))]);
  };

  const handleToggleStep = (stepId: number) => {
    setLogs(prev => prev.map(l =>
      l.sender === 'step' && (l as StepLog).stepId === stepId
        ? { ...l as StepLog, isCollapsed: !(l as StepLog).isCollapsed }
        : l
    ));
  };

  return {
    logs,
    setLogs,
    traceEvents,
    setTraceEvents,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    addAgentLogs,
    handleToggleStep
  };
}
