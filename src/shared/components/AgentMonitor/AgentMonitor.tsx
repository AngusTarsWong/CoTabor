import React, { useState, useMemo } from "react";
import { Card, Flex, Typography, Space, Divider } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { UnifiedAgentState } from "../../types/agent-view-model";
import { WorkflowTreeNode } from "../../../sidepanel/components/antx/workflow";
import { AgentHeader } from "./AgentHeader";
import { AgentChain } from "./AgentChain";
import { AgentIntervention } from "./AgentIntervention";
import { WorkflowDetailModal } from "../../../sidepanel/components/antx/WorkflowDetailModal";

const { Text, Paragraph } = Typography;

export interface AgentMonitorProps {
  agent: UnifiedAgentState;
  nodes: WorkflowTreeNode[];
  layout?: 'sidepanel' | 'cockpit-card';
  style?: React.CSSProperties;
  className?: string;
}

export const AgentMonitor: React.FC<AgentMonitorProps> = ({
  agent,
  nodes,
  layout = 'cockpit-card',
  style,
  className,
}) => {
  const [selectedNode, setSelectedNode] = useState<WorkflowTreeNode | null>(null);

  const isSidePanel = layout === 'sidepanel';
  
  const summaryBg = agent.status === 'success' ? '#ecfdf5'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#fef2f2'
    : '#eff6ff';
  const summaryBorder = agent.status === 'success' ? '#a7f3d0'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#fecaca'
    : '#bfdbfe';
  const summaryTitleColor = agent.status === 'success' ? '#047857'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#b91c1c'
    : '#1d4ed8';

  const containerStyle: React.CSSProperties = isSidePanel ? {
    borderRadius: 20,
    border: "1px solid #dbeafe",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.05)",
    ...style,
  } : {
    height: "100%",
    borderRadius: 16,
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
    display: "flex",
    flexDirection: "column",
    ...style,
  };

  const bodyStyle: React.CSSProperties = isSidePanel ? {
    padding: 18,
  } : {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  return (
    <>
      <Card
        size="small"
        style={containerStyle}
        bodyStyle={bodyStyle}
        className={className}
      >
        <Space direction="vertical" size={isSidePanel ? 16 : 12} style={{ width: "100%" }}>
          {/* 1. Header: Status, Title, Timer, Hostname */}
          <AgentHeader agent={agent} layout={layout} />

          {/* 2. Intervention: Human input request */}
          {agent.humanRequest && <AgentIntervention request={agent.humanRequest} />}

          {/* 3. Thought Chain: The core execution log */}
          <div style={{ 
            flex: isSidePanel ? "none" : 1, 
            overflowY: isSidePanel ? "visible" : "auto",
            minHeight: isSidePanel ? 0 : 100 
          }}>
            <AgentChain 
              nodes={nodes} 
              onNodeClick={setSelectedNode}
              filterTaskRunId={agent.taskRunId}
            />
          </div>

          {/* 4. Results/Summary: Conclusion or error */}
          {(agent.summarySoFar || agent.error) && (
            <div style={{ 
              background: summaryBg, 
              border: `1px solid ${summaryBorder}`, 
              borderRadius: 12, 
              padding: "12px 14px" 
            }}>
              <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                {agent.status === 'success' ? (
                  <CheckCircleOutlined style={{ color: summaryTitleColor, fontSize: 14 }} />
                ) : (
                  <ExclamationCircleOutlined style={{ color: summaryTitleColor, fontSize: 14 }} />
                )}
                <Text strong style={{ fontSize: 13, color: summaryTitleColor }}>
                  {agent.status === 'success' ? '执行结论' : '执行摘要'}
                </Text>
              </Flex>
              <Paragraph
                ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}
              >
                {agent.error || agent.summarySoFar}
              </Paragraph>
            </div>
          )}
        </Space>
      </Card>

      {/* 5. Detail Modal: Preserved inspection functionality */}
      <WorkflowDetailModal 
        node={selectedNode} 
        onClose={() => setSelectedNode(null)} 
      />
    </>
  );
};
