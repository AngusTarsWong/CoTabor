import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, Flex, Typography, Space, Button, Modal } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, ExportOutlined } from "@ant-design/icons";
import { UnifiedAgentState, AgentLayoutMode } from "../../types/agent-view-model";
import { WorkflowTreeNode } from "../../../sidepanel/components/antx/workflow";
import { AgentHeader } from "./AgentHeader";
import { AgentChain } from "./AgentChain";
import { AgentIntervention } from "./AgentIntervention";
import { WorkflowDetailModal } from "../../../sidepanel/components/antx/WorkflowDetailModal";

const { Text, Paragraph } = Typography;

export interface AgentMonitorProps {
  agent: UnifiedAgentState;
  nodes: WorkflowTreeNode[];
  layout?: AgentLayoutMode;
  style?: React.CSSProperties;
  className?: string;
  hideSummary?: boolean;
}

export const AgentMonitor: React.FC<AgentMonitorProps> = ({
  agent,
  nodes,
  layout = 'cockpit-card',
  style,
  className,
  hideSummary = false,
}) => {
  const { t } = useTranslation('sidepanel');
  const [selectedNode, setSelectedNode] = useState<WorkflowTreeNode | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isConclusionModalOpen, setIsConclusionModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSidePanel = layout === 'sidepanel';
  const isGrid = layout === 'swarm-grid';

  // Auto-scroll to bottom when nodes change in cockpit card mode
  useEffect(() => {
    if (scrollRef.current && !isSidePanel && !isGrid) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [nodes.length, isSidePanel, isGrid]);

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
    background: "transparent",
    border: "none",
    boxShadow: "none",
    padding: 0,
    ...style,
  } : isGrid ? {
    height: "100%",
    borderRadius: 12,
    border: agent.humanRequest ? "1px solid #fed7aa" : "1px solid #e2e8f0",
    background: agent.humanRequest ? "#fff7ed" : "#ffffff",
    boxShadow: isHovered ? "0 4px 12px rgba(15, 23, 42, 0.08)" : "0 1px 3px rgba(0,0,0,0.02)",
    transition: "all 0.2s ease",
    cursor: "pointer",
    position: "relative",
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
    padding: 0,
  } : isGrid ? {
    padding: "8px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  } : {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  if (isGrid) {
    return (
      <div
        style={containerStyle}
        className={className}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setSelectedNode(nodes[nodes.length - 1] || null)}
      >
        <div style={bodyStyle}>
          <AgentHeader agent={agent} layout={layout} />

          {/* Progress Summary for Grid */}
          {agent.currentStep && (
            <div style={{ marginTop: 2 }}>
              <Text
                type="secondary"
                italic
                ellipsis={{ tooltip: agent.currentStep }}
                style={{ fontSize: 10, display: 'block', opacity: 0.8, lineHeight: '1.4' }}
              >
                {agent.status === 'running' ? `▶ ${agent.currentStep}` : agent.currentStep}
              </Text>
            </div>
          )}

          <div style={{ flex: 1 }} />
          {agent.humanRequest && (
            <Text type="danger" style={{ fontSize: 10, fontWeight: 600 }}>
              <ExclamationCircleOutlined /> {t('agentMonitor.needsIntervention')}
            </Text>
          )}
        </div>
        <WorkflowDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      </div>
    );
  }

  const content = (
    <Space direction="vertical" size={isSidePanel ? 12 : 16} style={{ width: "100%" }}>
      {/* 1. Header: Status, Title (only for card), Timer, Hostname */}
      <AgentHeader agent={agent} layout={layout} />

      {/* 2. Intervention: Human input request */}
      {agent.humanRequest && <AgentIntervention request={agent.humanRequest} />}

      {/* 3. Thought Chain: The core execution log */}
      <div
        ref={scrollRef}
        style={{
          flex: isSidePanel ? "none" : 1,
          overflowY: isSidePanel ? "visible" : "auto",
          minHeight: isSidePanel ? 0 : 100
        }}
      >
        <AgentChain
          nodes={nodes}
          onNodeClick={setSelectedNode}
          filterTaskRunId={agent.taskRunId}
        />
      </div>

      {/* 4. Results/Summary: Conclusion or error */}
      {!hideSummary && (agent.summarySoFar || agent.error) && (
        <div
          style={{
            background: summaryBg,
            border: `1px solid ${summaryBorder}`,
            borderRadius: 12,
            padding: "12px 14px",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onClick={() => setIsConclusionModalOpen(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
            {agent.status === 'success' ? (
              <CheckCircleOutlined style={{ color: summaryTitleColor, fontSize: 14 }} />
            ) : (
              <ExclamationCircleOutlined style={{ color: summaryTitleColor, fontSize: 14 }} />
            )}
            <Text strong style={{ fontSize: 13, color: summaryTitleColor }}>
              {agent.status === 'success' ? t('agentMonitor.resultTitle') : t('agentMonitor.summaryTitle')}
            </Text>
          </Flex>
          <Paragraph
            ellipsis={{ rows: 3 }}
            style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}
          >
            {agent.error || agent.summarySoFar}
          </Paragraph>
        </div>
      )}
    </Space>
  );

  return (
    <>
      {isSidePanel ? (
        <div style={containerStyle} className={className}>
          {content}
        </div>
      ) : (
        <Card
          size="small"
          style={containerStyle}
          bodyStyle={bodyStyle}
          className={className}
        >
          {content}
        </Card>
      )}

      {/* 5. Detail Modal: Preserved inspection functionality */}
      <WorkflowDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />

      {/* 6. Conclusion Modal: Full text display */}
      <Modal
        title={agent.status === 'success' ? t('agentMonitor.resultTitle') : t('agentMonitor.summaryTitle')}
        open={isConclusionModalOpen}
        onCancel={() => setIsConclusionModalOpen(false)}
        footer={null}
        width={600}
        centered
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: '#374151', padding: '4px 0' }}>
          {agent.error || agent.summarySoFar}
        </div>
      </Modal>
    </>
  );
};
