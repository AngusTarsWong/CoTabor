import React, { useEffect, useState } from 'react';
import { IntegrationStatus } from '../../shared/storage/integration-status';

interface HeaderProps {
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  showDebug: boolean;
  setShowDebug: (show: boolean) => void;
  openOptions: () => void;
  onBindCurrentPage: () => void;
  integrationStatus: IntegrationStatus;
}

type BannerConfig = {
  tone: 'success' | 'warning' | 'info';
  text: React.ReactNode;
};

function getBannerConfig(status: IntegrationStatus, openOptions: () => void): BannerConfig {
  if (status.activeMemoryBackend === 'notion') {
    return {
      tone: 'success',
      text: <>已检测到 <strong>Notion</strong> 记忆后端已启用，当前正在使用跨设备 AI 记忆库。</>,
    };
  }

  if (status.activeMemoryBackend === 'feishu') {
    return {
      tone: 'success',
      text: <>已检测到 <strong>飞书</strong> 记忆后端已启用，当前正在使用跨设备 AI 记忆库。</>,
    };
  }

  if (status.notion.authorized && !status.notion.configured) {
    return {
      tone: 'info',
      text: <>已检测到 <strong>Notion 已授权</strong>，但尚未完成母文档与数据库初始化。前往 <a href="#" onClick={(e) => { e.preventDefault(); openOptions(); }} style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}>设置</a> 完成启用。</>,
    };
  }

  if (status.notion.configured && !status.notion.active) {
    return {
      tone: 'info',
      text: <>已检测到 <strong>Notion 记忆后端</strong> 已配置，但当前未切换为启用状态。前往 <a href="#" onClick={(e) => { e.preventDefault(); openOptions(); }} style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}>设置</a> 检查激活状态。</>,
    };
  }

  if (status.feishu.configured && !status.feishu.active) {
    return {
      tone: 'info',
      text: <>已检测到 <strong>飞书记忆后端</strong> 已配置，但当前未切换为启用状态。前往 <a href="#" onClick={(e) => { e.preventDefault(); openOptions(); }} style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}>设置</a> 检查激活状态。</>,
    };
  }

  return {
    tone: 'warning',
    text: <>当前正在使用本地浏览器记忆。为防止数据丢失并获得跨设备的 AI 记忆库，建议 <a href="#" onClick={(e) => { e.preventDefault(); openOptions(); }} style={{ color: "#d97706", fontWeight: "bold", textDecoration: "underline" }}>配置飞书或 Notion</a> 获得完整体验。</>,
  };
}

function getBannerStyle(tone: BannerConfig['tone']): React.CSSProperties {
  if (tone === 'success') {
    return {
      backgroundColor: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#166534",
    };
  }
  if (tone === 'info') {
    return {
      backgroundColor: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1d4ed8",
    };
  }
  return {
    backgroundColor: "#fef3c7",
    border: "1px solid #fde68a",
    color: "#92400e",
  };
}

export const Header: React.FC<HeaderProps> = ({ boundTabId, boundTabTitle, boundTabUrl, showDebug, setShowDebug, openOptions, onBindCurrentPage, integrationStatus }) => {
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

  const banner = getBannerConfig(integrationStatus, openOptions);
  const bannerStyle = getBannerStyle(banner.tone);

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

      {/* Cloud Config Banner */}
      <div style={{ ...bannerStyle, padding: "6px 10px", borderRadius: "6px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>💡</span>
          <span>{banner.text}</span>
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <div style={{ padding: "4px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, backgroundColor: integrationStatus.activeMemoryBackend ? "#dcfce7" : "#f3f4f6", color: integrationStatus.activeMemoryBackend ? "#166534" : "#6b7280", border: `1px solid ${integrationStatus.activeMemoryBackend ? "#bbf7d0" : "#e5e7eb"}` }}>
          记忆后端：{integrationStatus.activeMemoryBackend ? integrationStatus.activeMemoryBackend : "本地"}
        </div>
        <div style={{ padding: "4px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, backgroundColor: integrationStatus.llm.configured ? "#eff6ff" : "#f3f4f6", color: integrationStatus.llm.configured ? "#1d4ed8" : "#6b7280", border: `1px solid ${integrationStatus.llm.configured ? "#bfdbfe" : "#e5e7eb"}` }}>
          模型：{integrationStatus.llm.configured ? "已配置" : "默认配置"}
        </div>
        <div style={{ padding: "4px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, backgroundColor: integrationStatus.mcp.enabledCount > 0 ? "#f5f3ff" : "#f3f4f6", color: integrationStatus.mcp.enabledCount > 0 ? "#6d28d9" : "#6b7280", border: `1px solid ${integrationStatus.mcp.enabledCount > 0 ? "#ddd6fe" : "#e5e7eb"}` }}>
          MCP：{integrationStatus.mcp.enabledCount > 0 ? `${integrationStatus.mcp.enabledCount} 个已启用` : "未配置"}
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
