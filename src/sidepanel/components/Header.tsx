import React from 'react';

interface HeaderProps {
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  openOptions: () => void;
  onBindCurrentPage: () => void;
}

export const Header: React.FC<HeaderProps> = ({ boundTabId, boundTabTitle, boundTabUrl, showDebug, setShowDebug, openOptions, onBindCurrentPage }) => {
  return (
    <header style={{ padding: "14px 16px", backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", zIndex: 10, gap: "12px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0, flex: 1 }}>
        <div style={{ width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "14px", flexShrink: 0 }}>C</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: boundTabId ? "6px" : 0 }}>
            <h1 style={{ fontSize: "16px", margin: 0, fontWeight: 600, color: "#111827" }}>CoTabor</h1>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: boundTabId ? "#10b981" : "#ef4444" }} title={boundTabId ? "已连接" : "未连接"} />
          </div>
          {boundTabId && (
            <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5, minWidth: 0 }}>
              <div style={{ color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                #{boundTabId} · {boundTabTitle || "未获取到页面标题"}
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={boundTabUrl || ""}>
                {boundTabUrl || "未获取到页面链接"}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button 
          onClick={onBindCurrentPage}
          style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151", borderRadius: "6px", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", transition: "all 0.2s" }}
          title="将 Agent 绑定到当前激活的标签页"
        >
          🔗 在当前页面操作
        </button>
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
