import React, { useMemo } from "react";
import { Space, Tag, Typography } from "antd";
import type { SubAgentRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";
import type { WorkflowNodeRecord } from "../../sidepanel/components/antx/workflow";
import { buildWorkflowTree } from "../../sidepanel/components/antx/workflow";
import { CotaborThoughtChain } from "../../sidepanel/components/antx/CotaborThoughtChain";

const { Text } = Typography;

interface SwarmThoughtChainProps {
  agents: SubAgentRuntimeSnapshot[];
  workflowNodes: WorkflowNodeRecord[];
  selectedNodeId: string | null;
  onSelectAgent: (nodeId: string | null) => void;
}

export const SwarmThoughtChain: React.FC<SwarmThoughtChainProps> = ({
  agents,
  workflowNodes,
  selectedNodeId,
  onSelectAgent,
}) => {
  const selectedAgent = selectedNodeId ? agents.find(a => a.nodeId === selectedNodeId) : null;
  const treeNodes = useMemo(() => buildWorkflowTree(workflowNodes), [workflowNodes]);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%", height: "100%" }}>
      <Space size={6} wrap>
        <Tag
          color={selectedNodeId == null ? "blue" : "default"}
          style={{ cursor: "pointer", borderRadius: 999 }}
          onClick={() => onSelectAgent(null)}
        >
          全局
        </Tag>
        {agents.map(agent => (
          <Tag
            key={agent.nodeId}
            color={selectedNodeId === agent.nodeId ? "blue" : "default"}
            style={{ cursor: "pointer", borderRadius: 999 }}
            onClick={() => onSelectAgent(agent.nodeId)}
          >
            {agent.title ?? agent.nodeId}
          </Tag>
        ))}
      </Space>

      {treeNodes.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 13 }}>暂无执行记录</Text>
      ) : (
        <CotaborThoughtChain
          nodes={treeNodes}
          filterTaskRunId={selectedAgent?.taskRunId}
        />
      )}
    </Space>
  );
};
