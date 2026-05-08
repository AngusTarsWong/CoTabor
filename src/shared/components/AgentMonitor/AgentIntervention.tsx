import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Typography, Tag, Flex, Space } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { SubAgentHumanRequest } from "../../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

export interface AgentInterventionProps {
  request: SubAgentHumanRequest;
}

export const AgentIntervention: React.FC<AgentInterventionProps> = ({ request }) => {
  const { t } = useTranslation('sidepanel');
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "10px 14px" }}>
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Flex align="center" gap={8}>
          <WarningOutlined style={{ color: "#ea580c", fontSize: 14 }} />
          <Tag color="orange" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
            {t(`agentMonitor.intervention.type.${request.type}`, { defaultValue: t('agentMonitor.intervention.type.default') })}
          </Tag>
        </Flex>
        <Text strong style={{ fontSize: 13, color: "#9a3412", display: "block" }}>
          {request.message}
        </Text>
        {request.actionDescription && (
          <Text type="secondary" style={{ fontSize: 12, color: "#c2410c" }}>
            {t('agentMonitor.intervention.intent', { action: request.actionDescription })}
          </Text>
        )}
      </Space>
    </div>
  );
};
