import React, { useMemo } from "react";
import { Avatar, Card, Flex, Space, Tag, Typography, Tooltip, Drawer, Alert } from "antd";
import { ClockCircleFilled, PauseCircleFilled, RobotOutlined, CheckCircleFilled, SyncOutlined, WarningFilled } from "@ant-design/icons";
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

  // Swarm Dashboard Logic: Only trigger if there are active sub-agents running in a DAG
  const swarmAgents = resourceRuntime?.agents || [];
  const isSwarmMode = swarmAgents.length > 0;
  
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const selectedAgent = swarmAgents.find(a => a.nodeId === selectedAgentId);

  const getAgentStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircleFilled style={{ color: "#52c41a" }} />;
      case "failed": return <WarningFilled style={{ color: "#ff4d4f" }} />;
      case "running": return <SyncOutlined spin style={{ color: "#1677ff" }} />;
      default: return <ClockCircleFilled style={{ color: "#faad14" }} />;
    }
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
          <ResourceRuntimePanel
            resourceRuntime={resourceRuntime}
            humanRequest={humanRequest}
          />

          {isSwarmMode && (
            <Card size="small" style={{ borderRadius: 12, background: '#f5f8ff', border: 'none' }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text strong style={{ fontSize: 13, color: '#1d4ed8' }}>蜂群指挥中枢 (Master Plan)</Text>
                <Flex gap={8} wrap="wrap">
                  {swarmAgents.map((agent) => (
                    <Tooltip key={agent.nodeId} title="点击查看专属详情">
                      <div 
                        style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                        onClick={() => setSelectedAgentId(agent.nodeId)}
                      >
                        <Avatar 
                          size={32} 
                          icon={<RobotOutlined />} 
                          style={{ 
                            background: agent.status === 'success' ? '#f6ffed' : agent.status === 'running' ? '#e6f4ff' : agent.status === 'failed' ? '#fff1f0' : '#f5f5f5',
                            color: agent.status === 'success' ? '#52c41a' : agent.status === 'running' ? '#1677ff' : agent.status === 'failed' ? '#ff4d4f' : '#8c8c8c',
                            border: `1px solid ${agent.status === 'success' ? '#b7eb8f' : agent.status === 'running' ? '#91caff' : agent.status === 'failed' ? '#ffa39e' : '#d9d9d9'}`
                          }} 
                        />
                        <div style={{ position: 'absolute', bottom: -2, right: -4, background: '#fff', borderRadius: '50%', padding: 1, display: 'flex' }}>
                          {getAgentStatusIcon(agent.status)}
                        </div>
                      </div>
                    </Tooltip>
                  ))}
                </Flex>
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

      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#1677ff' }} />
            <span>子 Agent 详情 ({selectedAgent?.nodeId})</span>
          </Space>
        }
        placement="right"
        width={360}
        onClose={() => setSelectedAgentId(null)}
        open={!!selectedAgent}
        bodyStyle={{ padding: 16 }}
      >
        {selectedAgent && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" bordered={false} style={{ background: '#f5f8ff' }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Flex justify="space-between">
                  <Text type="secondary">当前状态</Text>
                  <Tag color={selectedAgent.status === 'success' ? 'success' : selectedAgent.status === 'running' ? 'processing' : selectedAgent.status === 'failed' ? 'error' : 'default'}>
                    {selectedAgent.status.toUpperCase()}
                  </Tag>
                </Flex>
                <Flex justify="space-between">
                  <Text type="secondary">重规划次数</Text>
                  <Text>{selectedAgent.replanCount}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text type="secondary">重试次数</Text>
                  <Text>{selectedAgent.retryCount}</Text>
                </Flex>
                {selectedAgent.currentUrl && (
                  <Flex justify="space-between" align="flex-start" gap={8}>
                    <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>当前页面</Text>
                    <Text ellipsis={{ tooltip: selectedAgent.currentUrl }} style={{ maxWidth: 200, textAlign: 'right' }}>
                      <a href={selectedAgent.currentUrl} target="_blank" rel="noreferrer">{selectedAgent.currentUrl}</a>
                    </Text>
                  </Flex>
                )}
              </Space>
            </Card>

            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>阶段性摘要</Text>
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0', fontSize: 13, lineHeight: '1.6' }}>
                {selectedAgent.summarySoFar || "暂无阶段性总结..."}
              </div>
            </div>

            {selectedAgent.error && (
              <div>
                <Text strong type="danger" style={{ marginBottom: 8, display: 'block' }}>异常信息</Text>
                <div style={{ background: '#fff2f0', padding: 12, borderRadius: 8, border: '1px solid #ffccc7', fontSize: 13, color: '#cf1322' }}>
                  {selectedAgent.error}
                </div>
              </div>
            )}
            
            <Alert 
              type="info" 
              showIcon 
              message="具体的子节点日志已合并至全局流程中。该面板用于宏观监控此 Agent 的状态指标。" 
              style={{ marginTop: 16 }} 
            />
          </Space>
        )}
      </Drawer>
    </Card>
  );
};
