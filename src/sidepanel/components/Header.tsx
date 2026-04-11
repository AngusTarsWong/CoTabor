import React from 'react';

interface HeaderProps {
  boundTabId: number | null;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  openOptions: () => void;
}

export const Header: React.FC<HeaderProps> = ({ boundTabId, showDebug, setShowDebug, openOptions }) => {
  return (
    <header style={{ padding: "14px 16px", backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "14px" }}>C</div>
        <h1 style={{ fontSize: "16px", margin: 0, fontWeight: 600, color: "#111827" }}>CoTabor</h1>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: boundTabId ? "#10b981" : "#ef4444", marginLeft: "4px" }} title={boundTabId ? "已连接" : "未连接"} />
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button 
          onClick={() => setShowDebug(!showDebug)}
          style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #e5e7eb", backgroundColor: showDebug ? "#f3f4f6" : "#ffffff", borderRadius: "6px", cursor: "pointer", color: "#4b5563", display: "flex", alignItems: "center", gap: "4px" }}
          title="开发者调试模式"
        >
          🐛 调试
        </button>
        <button 
          onClick={openOptions}
          style={{ padding: "6px 10px", fontSize: "13px", border: "none", backgroundColor: "#eff6ff", color: "#4f46e5", borderRadius: "6px", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px" }}
        >
          ⚙️ 设置
        </button>
      </div>
    </header>
  );
};
