import React from "react";
import { Card, Flex, Space, Typography, Progress, Button, Badge } from "antd";
import { PartitionOutlined, ArrowRightOutlined } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface SwarmMasterCardProps {
  agents: SubAgentRuntimeSnapshot[];
  onOpenCockpit: () => void;
}

const BeeStatus: React.FC<{ status: SubAgentRuntimeSnapshot["status"]; hasIntervention: boolean }> = ({ status, hasIntervention }) => {
  if (hasIntervention) return <span title="需要介入" style={{ fontSize: 16 }}>🚨</span>;
  
  switch (status) {
    case "success": return <span title="已完成" style={{ fontSize: 16 }}>🐝</span>;
    case "failed": return <span title="失败" style={{ fontSize: 16 }}>🥀</span>;
    case "running":
    case "starting":
    case "replanning":
      return <span className="swarm-bee-flying" title="工作中" style={{ fontSize: 16 }}>🐝</span>;
    default: return <span title="等待中" style={{ fontSize: 16, opacity: 0.4 }}>🐝</span>;
  }
};

export const SwarmMasterCard: React.FC<SwarmMasterCardProps> = ({ agents, onOpenCockpit }) => {
  const completedCount = agents.filter(a => a.status === "success").length;
  const totalCount = agents.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const interventionCount = agents.filter(a => a.humanRequest != null).length;

  return (
    <Card
      size="small"
      style={{
        borderRadius: 16,
        border: "1px solid #eef2f7",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
        background: "#ffffff",
        overflow: "hidden",
        width: "100%",
      }}
      bodyStyle={{ padding: "12px 16px" }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center">
          <Space>
            <div style={{ background: "#f0f7ff", padding: 6, borderRadius: 8, display: "flex" }}>
              <PartitionOutlined style={{ color: "#2563eb" }} />
            </div>
            <Text strong style={{ fontSize: 14 }}>蜂群任务执行中</Text>
          </Space>
          <Badge count={interventionCount} offset={[5, 0]}>
            <Tag color={percent === 100 ? "success" : "processing"} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
              {percent === 100 ? "全部完成" : `${completedCount}/${totalCount}`}
            </Tag>
          </Badge>
        </Flex>

        <Progress 
          percent={percent} 
          size="small" 
          showInfo={false} 
          strokeColor={{ '0%': '#2563eb', '100%': '#4f46e5' }}
          style={{ margin: 0 }}
        />

        <div style={{ maxHeight: 120, overflowY: "auto", paddingRight: 4 }}>
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            {agents.map(agent => (
              <Flex key={agent.nodeId} justify="space-between" align="center">
                <Space size={8}>
                  <BeeStatus status={agent.status} hasIntervention={!!agent.humanRequest} />
                  <Text style={{ fontSize: 12, color: "#4b5563" }} ellipsis={{ tooltip: agent.title }}>
                    {agent.title || agent.nodeId}
                  </Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 11, fontStyle: "italic" }}>
                  {agent.humanRequest ? "等待干预" : agent.currentStep || agent.status}
                </Text>
              </Flex>
            ))}
          </Space>
        </div>

        <Button 
          block 
          type="dashed" 
          icon={<ArrowRightOutlined />} 
          onClick={onOpenCockpit}
          style={{ borderRadius: 8, fontSize: 12, color: "#64748b" }}
        >
          查看全景监视器
        </Button>
      </Space>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes swarm-bee-flying {
          0%, 100% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(-1px) rotate(-5deg); }
          75% { transform: translateY(1px) rotate(5deg); }
        }
        .swarm-bee-flying {
          display: inline-block;
          animation: swarm-bee-flying 0.6s ease-in-out infinite;
        }
      `}} />
    </Card>
  );
};

import { Tag } from "antd";
