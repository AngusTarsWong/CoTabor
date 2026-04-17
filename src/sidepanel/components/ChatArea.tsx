import React, { RefObject } from 'react';
import { StepCard, StepLog } from './StepCard';

type TextLog = {
  sender: 'user' | 'agent' | 'system';
  text: string;
  isError?: boolean;
  isSuccess?: boolean;
};

type LogMessage = TextLog | StepLog;

interface ChatAreaProps {
  logs: LogMessage[];
  isAgentRunning: boolean;
  hasHumanRequest: boolean;
  setAgentGoal: (goal: string) => void;
  logsEndRef: RefObject<HTMLDivElement>;
  runtimeStats: {
    stepNo: number;
    node: string;
    modelName: string;
    durationMs: number;
    stepTokens: number;
    totalTokens: number;
  } | null;
  onToggleStep: (stepId: number) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ logs, isAgentRunning, hasHumanRequest, setAgentGoal, logsEndRef, runtimeStats, onToggleStep }) => {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {runtimeStats && (
        <div style={{ alignSelf: "stretch", backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", lineHeight: 1.6 }}>
          <div><strong>步骤 #{runtimeStats.stepNo}</strong> · 节点: {runtimeStats.node}</div>
          <div>模型: {runtimeStats.modelName || "N/A"} · 耗时: {(runtimeStats.durationMs / 1000).toFixed(2)}s</div>
          <div>本步骤 Token: {runtimeStats.stepTokens} · 任务累计 Token: {runtimeStats.totalTokens}</div>
          {isAgentRunning && <div style={{ color: "#4f46e5" }}>⏱️ 正在持续更新中...</div>}
        </div>
      )}

      {logs.length === 0 && (
        <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", color: "#6b7280" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", fontSize: "24px" }}>
            ✨
          </div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#111827" }}>我是 CoTabor 助手</h2>
          <p style={{ margin: 0, fontSize: "14px", textAlign: "center", maxWidth: "240px", lineHeight: "1.5" }}>
            我可以帮您操作网页、提取信息、或者将内容沉淀到飞书记忆库中。
          </p>
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
            <button onClick={() => setAgentGoal("帮我总结当前页面的核心内容")} style={{ padding: "8px 12px", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#374151", fontSize: "13px", cursor: "pointer", textAlign: "left" }}>👉 帮我总结当前页面的核心内容</button>
            <button onClick={() => setAgentGoal("提取这个页面的表格并保存到飞书")} style={{ padding: "8px 12px", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#374151", fontSize: "13px", cursor: "pointer", textAlign: "left" }}>👉 提取这个页面的表格并保存</button>
          </div>
        </div>
      )}

      {logs.map((log, i) => {
        if (log.sender === 'step') {
          return <StepCard key={`step-${(log as StepLog).stepId}`} log={log as StepLog} onToggleCollapse={onToggleStep} />;
        }

        const tlog = log as TextLog;
        if (tlog.sender === 'system') {
          return (
            <div key={i} style={{ alignSelf: "center", backgroundColor: tlog.isError ? "#fef2f2" : tlog.isSuccess ? "#ecfdf5" : "#f3f4f6", color: tlog.isError ? "#b91c1c" : tlog.isSuccess ? "#047857" : "#4b5563", padding: "4px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: 500, margin: "4px 0" }}>
              {tlog.text}
            </div>
          );
        }

        const isUser = tlog.sender === 'user';
        return (
          <div key={i} style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "85%", display: "flex", flexDirection: "column", gap: "4px", alignItems: isUser ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "4px", marginRight: "4px" }}>
              {isUser ? "You" : "CoTabor"}
            </div>
            <div style={{
              backgroundColor: isUser ? "#2563eb" : "#ffffff",
              color: isUser ? "#ffffff" : "#1f2937",
              padding: "10px 14px",
              borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              fontSize: "14px",
              lineHeight: "1.5",
              boxShadow: isUser ? "0 2px 4px rgba(37, 99, 235, 0.2)" : "0 1px 3px rgba(0,0,0,0.05)",
              border: isUser ? "none" : "1px solid #e5e7eb",
              wordBreak: "break-word"
            }}>
              {tlog.text}
            </div>
          </div>
        );
      })}

      {isAgentRunning && !hasHumanRequest && (
        <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "16px 16px 16px 4px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div className="typing-indicator" style={{ display: "flex", gap: "4px" }}>
            <div style={{ width: "6px", height: "6px", backgroundColor: "#9ca3af", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "-0.32s" }} />
            <div style={{ width: "6px", height: "6px", backgroundColor: "#9ca3af", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both", animationDelay: "-0.16s" }} />
            <div style={{ width: "6px", height: "6px", backgroundColor: "#9ca3af", borderRadius: "50%", animation: "bounce 1.4s infinite ease-in-out both" }} />
          </div>
          <span style={{ fontSize: "13px", color: "#6b7280" }}>Agent is working...</span>
          <style>{`@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
        </div>
      )}
      <div ref={logsEndRef} />
    </div>
  );
};
