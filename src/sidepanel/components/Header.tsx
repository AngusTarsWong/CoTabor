import React, { useEffect, useState } from 'react';
import { Button, Flex, Space, Typography } from 'antd';
import { LinkOutlined, SettingOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface HeaderProps {
  boundTabId: number | null;
  boundTabTitle: string;
  boundTabUrl: string;
  openOptions: () => void;
  onBindCurrentPage: () => void;
}

export const Header: React.FC<HeaderProps> = ({ boundTabId, boundTabTitle, boundTabUrl, openOptions, onBindCurrentPage }) => {
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
    <header style={{ padding: "12px 16px", backgroundColor: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)", zIndex: 10 }}>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Space align="center" size={8}>
          <img src="/icons/icon48.png" alt="CoTabor Logo" style={{ width: "26px", height: "26px", borderRadius: "6px", objectFit: "cover" }} />
          <Title level={5} style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", color: "#111827" }}>
            CoTabor
            <Text type="secondary" style={{ fontSize: "12px", fontWeight: 400 }}>v{version}</Text>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: boundTabId ? "#10b981" : "#ef4444", marginLeft: "4px" }} title={boundTabId ? "已连接" : "未连接"} />
          </Title>
        </Space>

        <Space size={8} wrap>
          <Button
            onClick={onBindCurrentPage}
            icon={<LinkOutlined />}
            style={{ borderRadius: 10 }}
            title="将 Agent 绑定到当前激活的标签页"
          >
            绑定当前页面
          </Button>
          <Button
            onClick={openOptions}
            icon={<SettingOutlined />}
            style={{ borderRadius: 10 }}
          >
            设置
          </Button>
        </Space>
      </Flex>
      {boundTabId && (
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5, minWidth: 0, backgroundColor: "#f9fafb", padding: "8px 10px", borderRadius: "6px", border: "1px solid #f3f4f6" }}>
          <div style={{ color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            当前页面 · {boundTabTitle || "未获取到页面标题"}
          </div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }} title={boundTabUrl || ""}>
            {boundTabUrl || "未获取到页面链接"}
          </div>
        </div>
      )}
    </header>
  );
};
