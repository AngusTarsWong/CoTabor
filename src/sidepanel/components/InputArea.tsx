import React from 'react';

interface InputAreaProps {
  agentGoal: string;
  setAgentGoal: (goal: string) => void;
  isAgentRunning: boolean;
  handleStartAgent: () => void;
  handleStopAgent: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ agentGoal, setAgentGoal, isAgentRunning, handleStartAgent, handleStopAgent }) => {
  return (
    <div style={{ padding: "16px", backgroundColor: "#ffffff", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
        <textarea
          value={agentGoal}
          onChange={(e) => setAgentGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isAgentRunning && agentGoal.trim()) handleStartAgent();
            }
          }}
          placeholder={isAgentRunning ? "Agent 执行中..." : "告诉 CoTabor 你想做什么..."}
          disabled={isAgentRunning}
          style={{ 
            flex: 1, 
            height: "44px", 
            minHeight: "44px", 
            maxHeight: "120px", 
            padding: "12px 16px", 
            borderRadius: "22px", 
            border: "1px solid #d1d5db", 
            resize: "none",
            fontSize: "14px",
            boxSizing: "border-box",
            fontFamily: "inherit",
            lineHeight: "20px",
            backgroundColor: isAgentRunning ? "#f3f4f6" : "#ffffff",
            transition: "border-color 0.2s"
          }}
        />
        {!isAgentRunning ? (
          <button 
            onClick={handleStartAgent} 
            disabled={!agentGoal.trim()}
            style={{ 
              backgroundColor: agentGoal.trim() ? "#2563eb" : "#e5e7eb", 
              color: agentGoal.trim() ? "white" : "#9ca3af", 
              width: "44px", 
              height: "44px", 
              border: "none", 
              borderRadius: "50%", 
              cursor: agentGoal.trim() ? "pointer" : "not-allowed", 
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.2s, transform 0.1s",
              transform: agentGoal.trim() ? "scale(1.05)" : "scale(1)"
            }}
            title="发送指令"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        ) : (
          <button 
            onClick={handleStopAgent} 
            style={{ 
              backgroundColor: "#ef4444", 
              color: "white", 
              width: "44px", 
              height: "44px", 
              border: "none", 
              borderRadius: "50%", 
              cursor: "pointer", 
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 4px rgba(239, 68, 68, 0.3)"
            }}
            title="停止执行"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
