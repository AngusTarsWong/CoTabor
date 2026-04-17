import React, { useEffect, useRef, useState } from 'react';

export type StepLog = {
  sender: 'step';
  stepId: number;
  node: string;
  model?: string;
  status: 'running' | 'done';
  streamContent: string;
  duration_ms?: number;
  tokens?: { input: number; output: number; total: number };
  startTime: number;
  isCollapsed: boolean;
};

const NODE_LABELS: Record<string, string> = {
  planner: '🤔 规划',
  watchdog: '🐕 审核',
  replanner: '🔁 重规划',
  memory: '💾 记忆',
  experience: '📖 总结',
};

function LiveTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startTime);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(id);
  }, [startTime]);
  return <span>{(elapsed / 1000).toFixed(1)}s</span>;
}

export const StepCard: React.FC<{ log: StepLog; onToggleCollapse: (id: number) => void }> = ({ log, onToggleCollapse }) => {
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!log.isCollapsed && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [log.streamContent, log.isCollapsed]);

  const isDone = log.status === 'done';
  const bgColor = isDone ? '#ecfdf5' : '#eff6ff';
  const borderColor = isDone ? '#a7f3d0' : '#bfdbfe';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 12, padding: '8px 12px', fontSize: 13, lineHeight: '1.5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{NODE_LABELS[log.node] ?? log.node}</span>
          {log.model && (
            <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 6, padding: '1px 6px', fontSize: 11 }}>
              {log.model}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#6b7280', fontSize: 12 }}>
          {isDone
            ? <span>{((log.duration_ms ?? 0) / 1000).toFixed(1)}s</span>
            : <LiveTimer startTime={log.startTime} />}
          {log.tokens && (
            <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '1px 6px' }}>
              {log.tokens.total} tokens
            </span>
          )}
          <button
            onClick={() => onToggleCollapse(log.stepId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
            title={log.isCollapsed ? '展开思考过程' : '折叠'}
          >
            {log.isCollapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>
      {!log.isCollapsed && (
        <div
          ref={streamRef}
          style={{
            marginTop: 8,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 8,
            padding: '6px 8px',
            fontFamily: 'monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#374151',
          }}
        >
          {log.streamContent || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>等待输出...</span>}
        </div>
      )}
    </div>
  );
};
