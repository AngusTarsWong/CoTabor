import React, { useEffect, useRef, useState } from 'react';

export type StepLog = {
  sender: 'step';
  stepId: number;
  node: string;
  model?: string;
  status: 'running' | 'done' | 'error';
  streamContent: string;
  duration_ms?: number;
  tokens?: { input: number; output: number; total: number };
  /** Error message if this step failed */
  error?: string;
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

// Friendly hints for known error patterns in specific nodes
const ERROR_HINTS: { pattern: RegExp; hint: string }[] = [
  { pattern: /notion/i,    hint: '💡 Notion 写入失败，请检查设置页的 Notion 记忆后端配置' },
  { pattern: /feishu|lark/i, hint: '💡 飞书写入失败，请检查设置页的飞书后端配置' },
  { pattern: /api key|unauthorized|401/i, hint: '💡 API 认证失败，请在设置页检查密钥是否填写正确' },
  { pattern: /timeout|ECONNREFUSED|ENOTFOUND/i, hint: '💡 网络请求超时或连接被拒，请检查网络环境' },
];

function getErrorHint(error: string): string | null {
  for (const { pattern, hint } of ERROR_HINTS) {
    if (pattern.test(error)) return hint;
  }
  return null;
}

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

  const isError   = log.status === 'error';
  const isDone    = log.status === 'done';
  const isRunning = log.status === 'running';

  // Color scheme by status
  const bgColor     = isError ? '#fff5f5' : isDone ? '#ecfdf5' : '#eff6ff';
  const borderColor = isError ? '#fca5a5' : isDone ? '#a7f3d0' : '#bfdbfe';
  const statusDot   = isError ? '🔴' : isDone ? '🟢' : '🔵';

  const errorHint = log.error ? getErrorHint(log.error) : null;

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 12, padding: '8px 12px', fontSize: 13, lineHeight: '1.5' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11 }}>{statusDot}</span>
          <span style={{ fontWeight: 600, color: isError ? '#b91c1c' : '#111827' }}>
            {NODE_LABELS[log.node] ?? log.node}
          </span>
          {log.model && (
            <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 6, padding: '1px 6px', fontSize: 11 }}>
              {log.model}
            </span>
          )}
          {isError && (
            <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>
              失败
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#6b7280', fontSize: 12 }}>
          {isDone || isError
            ? <span style={{ color: isError ? '#dc2626' : '#6b7280' }}>{((log.duration_ms ?? 0) / 1000).toFixed(1)}s</span>
            : <LiveTimer startTime={log.startTime} />}
          {log.tokens && (
            <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 6, padding: '1px 6px' }}>
              {log.tokens.total} tokens
            </span>
          )}
          <button
            onClick={() => onToggleCollapse(log.stepId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isError ? '#dc2626' : '#9ca3af', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
            title={log.isCollapsed ? (isError ? '展开查看错误' : '展开思考过程') : '折叠'}
          >
            {log.isCollapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>

      {/* Collapsed preview: show first line of error even when collapsed */}
      {log.isCollapsed && isError && log.error && (
        <div
          onClick={() => onToggleCollapse(log.stepId)}
          style={{ marginTop: 6, fontSize: 12, color: '#dc2626', cursor: 'pointer', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}
          title="点击展开查看完整错误"
        >
          ❌ {log.error}
        </div>
      )}

      {/* Expanded content */}
      {!log.isCollapsed && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Error block */}
          {isError && log.error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>❌ 错误详情</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                {log.error}
              </div>
              {errorHint && (
                <div style={{ marginTop: 8, padding: '6px 8px', background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#92400e', borderLeft: '3px solid #fbbf24' }}>
                  {errorHint}
                </div>
              )}
            </div>
          )}

          {/* Stream / thinking content */}
          {log.streamContent && (
            <div
              ref={streamRef}
              style={{
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
              {log.streamContent}
            </div>
          )}

          {/* Running placeholder if no content yet */}
          {isRunning && !log.streamContent && (
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' }}>
              等待输出...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
