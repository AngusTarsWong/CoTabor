import React from "react";
import { Alert, Space, Typography } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface InterventionBannerProps {
  agents: SubAgentRuntimeSnapshot[];
}

export const InterventionBanner: React.FC<InterventionBannerProps> = ({ agents }) => {
  const waiting = agents.filter(a => a.humanRequest != null);
  if (waiting.length === 0) return null;

  return (
    <Alert
      type="warning"
      banner
      icon={<WarningFilled />}
      message={
        <Space size={8}>
          <Text strong style={{ fontSize: 13 }}>
            {waiting.length} 个任务需要你介入
          </Text>
          <Text style={{ fontSize: 12, color: "#78350f" }}>
            {waiting.map(a => a.title ?? a.nodeId).join(" · ")}
          </Text>
        </Space>
      }
      style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}
    />
  );
};
