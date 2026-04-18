import React from 'react';

interface StopConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const StopConfirmModal: React.FC<StopConfirmModalProps> = ({ open, onCancel, onConfirm }) => {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '84px 16px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '18px',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ⛔
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>强制停止当前任务</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>用于处理死循环、长时间卡住或明显跑偏的情况</div>
            </div>
          </div>
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>
            确认后会立即中断当前执行流程，并停止后续步骤。
          </div>
        </div>

        <div style={{ padding: '14px 18px 18px' }}>
          <div
            style={{
              fontSize: '12px',
              color: '#92400e',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '10px 12px',
              lineHeight: '1.6',
              marginBottom: '14px',
            }}
          >
            停止后当前进度不会继续推进。如果只是临时等待页面响应，建议先观察几秒再决定是否中断。
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '12px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.22)',
              }}
            >
              强制停止
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
