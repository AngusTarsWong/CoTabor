import React from "react";
import { Alert, Typography, Tag, Flex, Space } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { SubAgentHumanRequest } from "../../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

const HUMAN_REQUEST_LABELS: Record<string, string> = {
  confirmation: '需确认',
  login: '需登录',
  captcha: '需验证码',
  '2fa': '需二步验证',
  stuck: '执行受阻',
};

export interface AgentInterventionProps {
  request: SubAgentHumanRequest;
}

export const AgentIntervention: React.FC<AgentInterventionProps> = ({ request }) => {
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }}>
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Flex align="center" gap={8}>
          <WarningOutlined style={{ color: "#ea580c", fontSize: 14 }} />
          <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
            {HUMAN_REQUEST_LABELS[request.type] || "需介入"}
          </Tag>
        </Flex>
        <Text strong style={{ fontSize: 13, color: "#9a3412", display: "block" }}>
          {request.message}
        </Text>
        {request.actionDescription && (
          <Text type="secondary" style={{ fontSize: 12, color: "#c2410c" }}>
            意图：{request.actionDescription}
          </Text>
        )}
      </Space>
    </div>
  );
};
