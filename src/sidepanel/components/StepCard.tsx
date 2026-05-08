import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type StepLog = {
  sender: 'step';
  stepId: number;
  node: string;
  taskRunId?: string;
  model?: string;
  status: 'running' | 'done' | 'error';
  thinkingContent?: string;
  streamContent: string;
  duration_ms?: number;
  tokens?: { input: number; output: number; total: number };
  /** Error message if this step failed */
  error?: string;
  startTime: number;
  isCollapsed: boolean;
};

type ErrorHintKey = 'notion' | 'apiKey' | 'network';

const ERROR_HINT_RULES: { pattern: RegExp; key: ErrorHintKey }[] = [
  { pattern: /notion/i,                           key: 'notion'  },
  { pattern: /api key|unauthorized|401/i,          key: 'apiKey'  },
  { pattern: /timeout|ECONNREFUSED|ENOTFOUND/i,    key: 'network' },
];

function getErrorHintKey(error: string): ErrorHintKey | null {
  for (const { pattern, key } of ERROR_HINT_RULES) {
    if (pattern.test(error)) return key;
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
  const { t } = useTranslation('sidepanel');

  useEffect(() => {
    if (!log.isCollapsed && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [log.streamContent, log.thinkingContent, log.isCollapsed]);

  const isError   = log.status === 'error';
  const isDone    = log.status === 'done';
  const isRunning = log.status === 'running';

  const bgColor     = isError ? '#fff5f5' : isDone ? '#ecfdf5' : '#eff6ff';
  const borderColor = isError ? '#fca5a5' : isDone ? '#a7f3d0' : '#bfdbfe';
  const statusDot   = isError ? '🔴' : isDone ? '🟢' : '🔵';

  const errorHintKey = log.error ? getErrorHintKey(log.error) : null;
  const nodeLabel = t(`step.node.${log.node}`, { defaultValue: log.node });

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 12, padding: '8px 12px', fontSize: 13, lineHeight: '1.5' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11 }}>{statusDot}</span>
          <span style={{ fontWeight: 600, color: isError ? '#b91c1c' : '#111827' }}>
            {nodeLabel}
          </span>
          {log.model && (
            <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 6, padding: '1px 6px', fontSize: 11 }}>
              {log.model}
            </span>
          )}
          {isError && (
            <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>
              {t('step.failed')}
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
            title={log.isCollapsed ? (isError ? t('step.expandError') : t('step.expandThinking')) : t('step.collapse')}
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
          title={t('step.clickExpandError')}
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
              <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>{t('step.errorDetails')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                {log.error}
              </div>
              {errorHintKey && (
                <div style={{ marginTop: 8, padding: '6px 8px', background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#92400e', borderLeft: '3px solid #fbbf24' }}>
                  {t(`step.error.${errorHintKey}`)}
                </div>
              )}
            </div>
          )}

          {/* Stream / thinking content */}
          {(log.thinkingContent || log.streamContent) && (
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
              {log.thinkingContent || log.streamContent}
            </div>
          )}

          {/* Running placeholder if no content yet */}
          {isRunning && !log.thinkingContent && !log.streamContent && (
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#9ca3af', fontStyle: 'italic', padding: '4px 0' }}>
              {t('step.waitingOutput')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
