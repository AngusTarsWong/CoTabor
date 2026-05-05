import React, { useMemo } from "react";
import { Card, Flex, Space, Tag, Typography, Alert, Progress, Button } from "antd";
import { ClockCircleFilled, PauseCircleFilled, WarningFilled, ArrowRightOutlined } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { RuntimeStats } from "../../hooks/useAppLogs";
import { HumanRequest } from "../../../lib/claw";
import type { SandboxRuntimeSnapshot } from "../../../core/orchestrator/types/ResourceRuntime";
import {
  WorkflowNodeRecord,
  WorkflowTreeNode,
  buildWorkflowNodeFromHumanRequest,
  buildWorkflowTree,
} from "./workflow";
import { ResourceRuntimePanel } from "./ResourceRuntimePanel";
import { CotaborThoughtChain } from "./CotaborThoughtChain";

const { Text } = Typography;

interface ProcessPanelProps {
  workflowNodes: WorkflowNodeRecord[];
  runtimeStats: RuntimeStats | null;
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  humanRequest: HumanRequest | null;
  resourceRuntime: SandboxRuntimeSnapshot | null;
}

function jumpToCockpit(cockpitTabId: number) {
  chrome.tabs.update(cockpitTabId, { active: true }).catch(() => {});
}

export const ProcessPanel: React.FC<ProcessPanelProps> = ({
  workflowNodes,
  runtimeStats,
  isAgentRunning,
  isAgentStopping,
  humanRequest,
  resourceRuntime,
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

  const swarmAgents = resourceRuntime?.agents ?? [];
  const isSwarmMode = swarmAgents.length > 0;
  const cockpitTabId = resourceRuntime?.cockpitTabId;

  const completedCount = swarmAgents.filter(a => a.status === "success").length;
  const totalCount = swarmAgents.length;
  const interventionAgents = swarmAgents.filter(a => a.humanRequest != null);
  const hasIntervention = interventionAgents.length > 0;

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
          {/* Show resource runtime panel only in non-swarm mode */}
          {!isSwarmMode && (
            <ResourceRuntimePanel
              resourceRuntime={resourceRuntime}
              humanRequest={humanRequest}
            />
          )}

          {/* Swarm summary card */}
          {isSwarmMode && (
            <Card
              size="small"
              style={{
                borderRadius: 12,
                background: hasIntervention ? "#fff7e6" : "#f5f8ff",
                border: hasIntervention ? "1px solid #ffd591" : "none",
              }}
              bodyStyle={{ padding: "12px 14px" }}
            >
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Flex justify="space-between" align="center">
                  <Text strong style={{ fontSize: 13, color: "#1d4ed8" }}>
                    🐝 蜂群任务进行中
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {completedCount}/{totalCount}
                  </Text>
                </Flex>

                <Progress
                  percent={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
                  size="small"
                  showInfo={false}
                  strokeColor="#1677ff"
                />

                {hasIntervention && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<WarningFilled />}
                    message={
                      <Text style={{ fontSize: 12 }}>
                        {interventionAgents.length} 个任务等待你介入：
                        {interventionAgents.map(a => a.title ?? a.nodeId).join(" · ")}
                      </Text>
                    }
                    style={{ borderRadius: 8, padding: "6px 10px" }}
                  />
                )}

                {cockpitTabId != null && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={() => jumpToCockpit(cockpitTabId)}
                    style={{ width: "100%", borderRadius: 8 }}
                  >
                    打开蜂群指挥台
                  </Button>
                )}
              </Space>
            </Card>
          )}

          <CotaborThoughtChain nodes={nodes} />

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
