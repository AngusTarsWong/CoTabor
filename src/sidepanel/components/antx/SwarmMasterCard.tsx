import React from "react";
import { useTranslation } from "react-i18next";
import { Card, Flex, Space, Typography, Button, Badge, Row, Col, Tag } from "antd";
import { PartitionOutlined, ArrowRightOutlined } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../../core/orchestrator/types/ResourceRuntime";
import { WorkflowNodeRecord, buildWorkflowTree } from "./workflow";
import { AgentMonitor } from "../../../shared/components/AgentMonitor";
import { UnifiedAgentState } from "../../../shared/types/agent-view-model";

const { Text } = Typography;

interface SwarmMasterCardProps {
  agents: SubAgentRuntimeSnapshot[];
  workflowNodes: WorkflowNodeRecord[];
  onOpenCockpit: () => void;
}

export const SwarmMasterCard: React.FC<SwarmMasterCardProps> = ({ agents, workflowNodes, onOpenCockpit }) => {
  const { t } = useTranslation('sidepanel');
  const completedCount = agents.filter(a => a.status === "success").length;
  const totalCount = agents.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const interventionAgents = agents.filter(a => a.humanRequest != null);
  const interventionCount = interventionAgents.length;

  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid #eef2f7",
        background: "#ffffff",
        padding: "10px",
        width: "100%",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
      }}
      className="swarm-master-card"
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center" style={{ padding: '0 4px' }}>
          <Space size={8}>
            <div style={{ background: "#f0f7ff", padding: 6, borderRadius: 8, display: "flex" }}>
              <PartitionOutlined style={{ color: "#2563eb", fontSize: 14 }} />
            </div>
            <div>
              <Text strong style={{ fontSize: 14, color: "#1e293b", display: "block", lineHeight: 1.2 }}>{t('swarm.taskTitle')}</Text>
              <Text type="secondary" style={{ fontSize: 10 }}>{t('swarm.agentCount', { count: totalCount })}</Text>
            </div>
          </Space>
          <Badge count={interventionCount} offset={[5, 0]} color="#f5222d">
            <Tag color={percent === 100 ? "success" : "processing"} style={{ borderRadius: 999, marginInlineEnd: 0, fontSize: 11 }}>
              {percent === 100 ? t('swarm.completed') : `${completedCount}/${totalCount}`}
            </Tag>
          </Badge>
        </Flex>

        <div style={{ width: "100%" }}>
          <Row gutter={[6, 6]} style={{ width: "100%", margin: 0 }}>
            {agents.map(agent => {
              const agentViewModel: UnifiedAgentState = {
                ...agent,
                id: agent.nodeId,
                title: agent.title || agent.nodeId,
              };
              const subNodes = buildWorkflowTree(workflowNodes.filter(n =>
                n.taskRunId === agent.taskRunId ||
                n.taskRunId === agent.nodeId ||
                (agent.originalTaskRunId && n.taskRunId === agent.originalTaskRunId)
              ));

              return (
                <Col key={agent.nodeId} span={12} style={{ paddingLeft: 3, paddingRight: 3 }}>
                  <div style={{ height: "105px" }}>
                    <AgentMonitor
                      agent={agentViewModel}
                      nodes={subNodes}
                      layout="swarm-grid"
                    />
                  </div>
                </Col>
              );
            })}
          </Row>
        </div>

        <Button
          block
          type="text"
          icon={<ArrowRightOutlined />}
          onClick={onOpenCockpit}
          style={{
            borderRadius: 8,
            fontSize: 12,
            color: "#64748b",
            background: "#f8fafc",
            height: "32px",
            marginTop: 4
          }}
        >
          {t('swarm.openMonitor')}
        </Button>
      </Space>
    </div>
  );};
