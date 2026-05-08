import React from "react";
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
  const completedCount = agents.filter(a => a.status === "success").length;
  const totalCount = agents.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const interventionAgents = agents.filter(a => a.humanRequest != null);
  const interventionCount = interventionAgents.length;

  return (
    <Card
      size="small"
      style={{
        borderRadius: 20,
        border: "1px solid #eef2f7",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
        background: "#ffffff",
        overflow: "hidden",
        width: "100%",
      }}
      bodyStyle={{ padding: "16px" }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center">
          <Space size={10}>
            <div style={{ background: "#f0f7ff", padding: 8, borderRadius: 10, display: "flex" }}>
              <PartitionOutlined style={{ color: "#2563eb", fontSize: 16 }} />
            </div>
            <div>
              <Text strong style={{ fontSize: 15, color: "#1e293b", display: "block", lineHeight: 1.2 }}>蜂群任务执行中</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>Coordinating {totalCount} agents</Text>
            </div>
          </Space>
          <Badge count={interventionCount} offset={[5, 0]} color="#f5222d">
            <Tag color={percent === 100 ? "success" : "processing"} style={{ borderRadius: 999, marginInlineEnd: 0, padding: '0 10px' }}>
              {percent === 100 ? "全部完成" : `${completedCount}/${totalCount}`}
            </Tag>
          </Badge>
        </Flex>

        <div style={{ width: "100%" }}>
          <Row gutter={[10, 10]}>
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
                <Col key={agent.nodeId} span={12}>
                  <div style={{ height: "100px" }}>
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
            borderRadius: 10,
            fontSize: 12,
            color: "#64748b",
            background: "#f8fafc",
            height: "36px"
          }}
        >
          查看全景监视器
        </Button>
      </Space>
    </Card>
  );
};
