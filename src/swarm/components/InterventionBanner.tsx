import React from "react";
import { Alert, Space, Typography, Button, Flex } from "antd";
import { WarningFilled, ArrowRightOutlined } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface InterventionBannerProps {
  agents: SubAgentRuntimeSnapshot[];
}

export const InterventionBanner: React.FC<InterventionBannerProps> = ({ agents }) => {
  const waiting = agents.filter(a => a.humanRequest != null);
  if (waiting.length === 0) return null;

  const handleJump = () => {
    const firstWithTab = waiting.find(a => a.tabId != null);
    if (firstWithTab?.tabId) {
      chrome.tabs.update(firstWithTab.tabId, { active: true }).catch(() => {});
    }
  };

  return (
    <Alert
      type="warning"
      banner
      icon={<WarningFilled />}
      message={
        <Flex justify="space-between" align="center" style={{ width: "100%" }}>
          <Space size={8}>
            <Text strong style={{ fontSize: 13 }}>
              {waiting.length} 个任务需要你介入
            </Text>
            <Text style={{ fontSize: 12, color: "#78350f" }}>
              {waiting.map(a => a.title ?? a.nodeId).join(" · ")}
            </Text>
          </Space>
          {waiting.length === 1 && waiting[0].tabId != null && (
            <Button 
              size="small" 
              type="primary" 
              danger 
              icon={<ArrowRightOutlined />}
              onClick={handleJump}
              style={{ fontSize: 12, borderRadius: 6 }}
            >
              立即前往处理
            </Button>
          )}
        </Flex>
      }
      style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", padding: "8px 24px" }}
    />
  );
};
