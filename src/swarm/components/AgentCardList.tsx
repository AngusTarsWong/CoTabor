import React from "react";
import { Space, Typography } from "antd";
import type { SubAgentRuntimeSnapshot, ObservedSubAgentStatus } from "../../core/orchestrator/types/ResourceRuntime";
import { AgentCard } from "./AgentCard";

const { Text } = Typography;

interface AgentCardListProps {
  agents: SubAgentRuntimeSnapshot[];
  selectedNodeId: string | null;
  onSelectAgent: (nodeId: string) => void;
}

const SECTION_ORDER: ObservedSubAgentStatus[] = [
  "running", "starting", "stopping", "failed", "stopped", "success",
];

const SECTION_LABELS: Record<ObservedSubAgentStatus, string> = {
  running: "运行中",
  starting: "准备中",
  stopping: "停止中",
  failed: "失败",
  stopped: "已停止",
  success: "已完成",
};

export const AgentCardList: React.FC<AgentCardListProps> = ({ agents, selectedNodeId, onSelectAgent }) => {
  const interventionAgents = agents.filter(a => a.humanRequest != null);
  const nonIntervention = agents.filter(a => a.humanRequest == null);

  const grouped = SECTION_ORDER.reduce((acc, status) => {
    acc[status] = nonIntervention.filter(a => a.status === status);
    return acc;
  }, {} as Record<ObservedSubAgentStatus, SubAgentRuntimeSnapshot[]>);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {interventionAgents.length > 0 && (
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Text strong style={{ fontSize: 12, color: "#ff4d4f", textTransform: "uppercase", letterSpacing: 0.5 }}>
            需要介入
          </Text>
          {interventionAgents.map(agent => (
            <AgentCard
              key={agent.nodeId}
              agent={agent}
              isSelected={selectedNodeId === agent.nodeId}
              onClick={() => onSelectAgent(agent.nodeId)}
            />
          ))}
        </Space>
      )}

      {SECTION_ORDER.filter(s => grouped[s].length > 0).map(status => (
        <Space key={status} direction="vertical" size={8} style={{ width: "100%" }}>
          <Text strong style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {SECTION_LABELS[status]}
          </Text>
          {grouped[status].map(agent => (
            <AgentCard
              key={agent.nodeId}
              agent={agent}
              isSelected={selectedNodeId === agent.nodeId}
              onClick={() => onSelectAgent(agent.nodeId)}
            />
          ))}
        </Space>
      ))}
    </Space>
  );
};
