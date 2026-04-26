import React, { useMemo } from "react";
import { Card, Flex, Space, Tag, Typography } from "antd";
import { ClockCircleFilled, PauseCircleFilled } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { RuntimeStats } from "../../hooks/useAppLogs";
import { HumanRequest } from "../../../lib/claw";
import {
  WorkflowNodeRecord,
  WorkflowTreeNode,
  buildWorkflowNodeFromHumanRequest,
  buildWorkflowTree,
} from "./workflow";
import { WorkflowNodeCard } from "./WorkflowNodeCard";

const { Text } = Typography;

interface ProcessPanelProps {
  workflowNodes: WorkflowNodeRecord[];
  runtimeStats: RuntimeStats | null;
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  humanRequest: HumanRequest | null;
}

export const ProcessPanel: React.FC<ProcessPanelProps> = ({
  workflowNodes,
  runtimeStats,
  isAgentRunning,
  isAgentStopping,
  humanRequest,
}) => {
  const { t } = useTranslation('sidepanel');

  const nodes = useMemo<WorkflowTreeNode[]>(() => {
    const items = [...workflowNodes];
    if (humanRequest) {
      items.push(buildWorkflowNodeFromHumanRequest(humanRequest, workflowNodes.length + 1));
    }
    return buildWorkflowTree(items);
  }, [humanRequest, workflowNodes]);

  if (nodes.length === 0) return null;

  const statusTag = () => {
    if (humanRequest) return <Tag color="gold" style={{ borderRadius: 999, marginInlineEnd: 0 }}>{t('common:status.waitingAuth')}</Tag>;
    if (isAgentStopping) return <Tag color="gold" style={{ borderRadius: 999, marginInlineEnd: 0 }}>{t('common:status.stopping')}</Tag>;
    if (isAgentRunning) return <Tag color="processing" style={{ borderRadius: 999, marginInlineEnd: 0 }}>{t('common:status.running')}</Tag>;
    return <Tag color="success" style={{ borderRadius: 999, marginInlineEnd: 0 }}>{t('common:status.completed')}</Tag>;
  };

  return (
    <Card
      size="small"
      style={{
        borderRadius: 20,
        borderColor: "#dbeafe",
        background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
      }}
      bodyStyle={{ padding: 18 }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center" gap={12}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 16, color: "#111827" }}>
              {t('process.title')}
            </Text>
            {runtimeStats && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('process.stepCounter', { num: runtimeStats.stepNo, tokens: runtimeStats.totalTokens })}
              </Text>
            )}
          </Space>
          {statusTag()}
        </Flex>

        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {nodes.map((node) => (
            <WorkflowNodeCard key={node.id} node={node} />
          ))}

          {isAgentStopping && !humanRequest && (
            <Card
              size="small"
              style={{
                borderRadius: 18,
                border: "1px solid #fde68a",
                background: "#fffdf5",
                boxShadow: "0 8px 24px rgba(217, 119, 6, 0.08)",
              }}
              bodyStyle={{ padding: "14px 16px" }}
            >
              <Space align="start" size={10}>
                <ClockCircleFilled style={{ color: "#d97706", fontSize: 16, marginTop: 2 }} />
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: "#92400e" }}>stopping</Text>
                  <Text style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>
                    {t('process.stoppingNotice')}
                  </Text>
                </Space>
              </Space>
            </Card>
          )}

          {humanRequest && (
            <Card
              size="small"
              style={{
                borderRadius: 18,
                border: "1px solid #fde68a",
                background: "#fffdf5",
                boxShadow: "0 8px 24px rgba(217, 119, 6, 0.08)",
              }}
              bodyStyle={{ padding: "14px 16px" }}
            >
              <Space align="start" size={10}>
                <PauseCircleFilled style={{ color: "#d97706", fontSize: 16, marginTop: 2 }} />
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: "#92400e" }}>human</Text>
                  <Text style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>{humanRequest.message}</Text>
                  {humanRequest.action_description && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {humanRequest.action_description}
                    </Text>
                  )}
                </Space>
              </Space>
            </Card>
          )}
        </Space>
      </Space>
    </Card>
  );
};
