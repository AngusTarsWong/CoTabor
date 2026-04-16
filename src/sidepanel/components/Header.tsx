import React, { useEffect, useState } from 'react';

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
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        setVersion(manifest.version);
      }
    } catch (e) {
      console.warn("Failed to get extension version", e);
    }
  }, []);

  return (
    <header style={{ padding: "12px 16px", backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", zIndex: 10 }}>
      {/* Top Row: Logo, Title, Version, and Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
        
        {/* Left: Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <img src="/icons/icon48.png" alt="CoTabor Logo" style={{ width: "26px", height: "26px", borderRadius: "6px", objectFit: "cover" }} />
          <h1 style={{ fontSize: "16px", margin: 0, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: "6px" }}>
            CoTabor
            <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "normal" }}>v{version}</span>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: boundTabId ? "#10b981" : "#ef4444", marginLeft: "4px" }} title={boundTabId ? "已连接" : "未连接"} />
          </h1>
        </div>

        {/* Right: Buttons */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
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
      </div>

      {/* Bottom Row: Bound Tab Info */}
      {boundTabId && (
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5, minWidth: 0, backgroundColor: "#f9fafb", padding: "8px 10px", borderRadius: "6px", border: "1px solid #f3f4f6" }}>
          <div style={{ color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            #{boundTabId} · {boundTabTitle || "未获取到页面标题"}
          </div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }} title={boundTabUrl || ""}>
            {boundTabUrl || "未获取到页面链接"}
          </div>
        </div>
      )}
    </header>
  );
};
