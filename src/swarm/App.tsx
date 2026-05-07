import React, { useMemo, useState, useEffect } from "react";
import { Flex, message, Typography, Button, Row, Col, Card, Tag, Space, Badge } from "antd";
import {
  HistoryOutlined,
  GlobalOutlined,
  ExportOutlined,
  SyncOutlined,
  LayoutOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useSwarmRuntime } from "./useSwarmRuntime";
import { CotaborThoughtChain } from "../sidepanel/components/antx/CotaborThoughtChain";
import { buildWorkflowTree } from "../sidepanel/components/antx/workflow";
import type { SubAgentRuntimeSnapshot } from "../core/orchestrator/types/ResourceRuntime";

const { Text, Title } = Typography;

const HUMAN_REQUEST_LABELS: Record<string, string> = {
  confirmation: '需确认',
  login: '需登录',
  captcha: '需验证码',
  '2fa': '需二步验证',
  stuck: '执行受阻',
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const BeeStatusIcon: React.FC<{ status: SubAgentRuntimeSnapshot["status"]; hasIntervention: boolean }> = ({ status, hasIntervention }) => {
  if (hasIntervention) return <span style={{ fontSize: 20 }}>🚨</span>;

  switch (status) {
    case "success": return <span style={{ fontSize: 20 }}>🐝</span>;
    case "failed": return <span style={{ fontSize: 20 }}>🥀</span>;
    case "running":
    case "starting":
    case "replanning":
      return <span className="swarm-bee-flying" style={{ fontSize: 20 }}>🐝</span>;
    case "stopping": return <span style={{ fontSize: 20, opacity: 0.5 }}>🐝</span>;
    case "stopped": return <span style={{ fontSize: 20 }}>💤</span>;
    case "waiting": return <span style={{ fontSize: 20, opacity: 0.3 }}>🐝</span>;
    default: return <span style={{ fontSize: 20, opacity: 0.4 }}>🐝</span>;
  }
};

const AgentMonitorCard: React.FC<{
  agent: SubAgentRuntimeSnapshot;
  workflowNodes: any[];
}> = ({ agent, workflowNodes }) => {
  const subNodes = useMemo(() => {
    const filtered = workflowNodes.filter(n => n.taskRunId === agent.taskRunId);
    return buildWorkflowTree(filtered);
  }, [workflowNodes, agent.taskRunId]);

  const isTerminal = agent.status === 'success' || agent.status === 'failed' || agent.status === 'stopped';

  // 实时计时器：运行中每秒刷新，完成后固定
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  const elapsedMs = isTerminal
    ? agent.updatedAt - agent.startedAt
    : now - agent.startedAt;

  const summaryBg = agent.status === 'success' ? '#ecfdf5'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#f9fafb'
    : '#eff6ff';
  const summaryBorder = agent.status === 'success' ? '#a7f3d0'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#e5e7eb'
    : '#bfdbfe';
  const summaryTitleColor = agent.status === 'success' ? '#047857'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '#6b7280'
    : '#1d4ed8';
  const summaryTitle = agent.status === 'success' ? '执行结论'
    : (agent.status === 'failed' || agent.status === 'stopped') ? '执行摘要'
    : '进展摘要';

  return (
    <Card
      size="small"
      title={
        <Flex justify="space-between" align="center" style={{ width: "100%" }}>
          <Space>
            <BeeStatusIcon status={agent.status} hasIntervention={!!agent.humanRequest} />
            <Text strong style={{ fontSize: 14 }}>{agent.title || agent.nodeId}</Text>
          </Space>
          <Tag color={
            agent.status === 'success' ? 'success' :
            agent.status === 'failed' ? 'error' :
            agent.status === 'running' ? 'processing' :
            agent.status === 'replanning' ? 'warning' :
            agent.status === 'waiting' ? 'default' : 'default'
          } style={{ borderRadius: 12 }}>
            {agent.status}
          </Tag>
        </Flex>
      }
      style={{
        height: "100%",
        borderRadius: 16,
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
        display: "flex",
        flexDirection: "column"
      }}
      bodyStyle={{
        flex: 1,
        overflowY: "auto",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}
    >
      {/* 信息条：URL + 当前步骤 + 统计数据 */}
      <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Flex justify="space-between">
            <Text type="secondary"><GlobalOutlined /> {agent.currentUrl ? new URL(agent.currentUrl).hostname : 'N/A'}</Text>
            {agent.tabId && (
              <Button
                type="link"
                size="small"
                icon={<ExportOutlined />}
                onClick={() => chrome.tabs.update(agent.tabId!, { active: true })}
                style={{ padding: 0, height: "auto", fontSize: 11 }}
              >
                跳转
              </Button>
            )}
          </Flex>
          <Text ellipsis={{ tooltip: agent.currentStep }} style={{ color: "#475569" }}>
            {agent.status === 'waiting' && agent.waitingFor?.length
              ? `等待：${agent.waitingFor.join(' → ')}`
              : agent.currentStep || "等待执行..."}
          </Text>
          {/* 统计行：耗时 + 重规划 + 重试 */}
          <Flex align="center" gap={6} style={{ flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <ClockCircleOutlined style={{ marginRight: 3 }} />
              {formatElapsed(elapsedMs)}
            </Text>
            {agent.replanCount > 0 && (
              <Tag color="orange" style={{ fontSize: 11, margin: 0, padding: '0 5px', lineHeight: '18px' }}>
                重规划 {agent.replanCount}次
              </Tag>
            )}
            {agent.retryCount > 0 && (
              <Tag color="red" style={{ fontSize: 11, margin: 0, padding: '0 5px', lineHeight: '18px' }}>
                重试 {agent.retryCount}次
              </Tag>
            )}
          </Flex>
        </Space>
      </div>

      {/* 人工介入详情面板 */}
      {agent.humanRequest && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>
          <Space direction="vertical" size={3} style={{ width: "100%" }}>
            <Flex align="center" gap={6}>
              <WarningOutlined style={{ color: "#ea580c", fontSize: 13 }} />
              <Tag color="orange" style={{ margin: 0, fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
                {HUMAN_REQUEST_LABELS[agent.humanRequest.type] || "需介入"}
              </Tag>
            </Flex>
            <Text strong style={{ fontSize: 12, color: "#9a3412", display: "block" }}>
              {agent.humanRequest.message}
            </Text>
            {agent.humanRequest.actionDescription && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                想执行：{agent.humanRequest.actionDescription}
              </Text>
            )}
          </Space>
        </div>
      )}

      {/* 思维链 / 结论展示区 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {subNodes.length > 0 ? (
          <CotaborThoughtChain nodes={subNodes} />
        ) : agent.summarySoFar ? (
          // 无节点但有摘要：将结论居中展示，填满空区域
          <Flex vertical align="center" justify="center" style={{ height: "100%", padding: "16px 12px" }}>
            {agent.status === 'success' ? (
              <CheckCircleOutlined style={{ fontSize: 32, color: "#10b981", marginBottom: 12 }} />
            ) : (
              <HistoryOutlined style={{ fontSize: 32, color: "#9ca3af", marginBottom: 12, opacity: 0.5 }} />
            )}
            <Text strong style={{ fontSize: 12, color: summaryTitleColor, marginBottom: 6 }}>
              {summaryTitle}
            </Text>
            <Typography.Paragraph
              ellipsis={{ rows: 5, expandable: true, symbol: '展开' }}
              style={{ margin: 0, fontSize: 13, color: "#374151", textAlign: "center", lineHeight: 1.6 }}
            >
              {agent.summarySoFar}
            </Typography.Paragraph>
          </Flex>
        ) : (
          <Flex vertical align="center" justify="center" style={{ height: "100%", opacity: 0.4 }}>
            <HistoryOutlined style={{ fontSize: 24, marginBottom: 8 }} />
            <Text style={{ fontSize: 12 }}>暂无执行日志</Text>
          </Flex>
        )}
      </div>

      {/* 任务结果摘要（仅当有思维链节点时显示，避免与中央结论重复） */}
      {agent.summarySoFar && subNodes.length > 0 && (
        <div style={{ background: summaryBg, border: `1px solid ${summaryBorder}`, borderRadius: 8, padding: "8px 12px" }}>
          <Flex align="center" gap={4} style={{ marginBottom: 4 }}>
            {agent.status === 'success' && <CheckCircleOutlined style={{ color: summaryTitleColor, fontSize: 12 }} />}
            <Text strong style={{ fontSize: 11, color: summaryTitleColor }}>
              {summaryTitle}
            </Text>
          </Flex>
          <Typography.Paragraph
            ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
            style={{ margin: 0, fontSize: 12, color: "#374151" }}
          >
            {agent.summarySoFar}
          </Typography.Paragraph>
        </div>
      )}

      {/* 错误详情 */}
      {agent.error && (
        <div style={{ background: "#fef2f2", padding: 8, borderRadius: 8, border: "1px solid #fecaca", fontSize: 12 }}>
          <Text type="danger">{agent.error}</Text>
        </div>
      )}
    </Card>
  );
};

export const SwarmApp: React.FC = () => {
  const { snapshot, workflowNodes, lifecycle } = useSwarmRuntime();
  const agents = snapshot?.agents ?? [];
  const hasSwarmRuntime = agents.length > 0;

  const handleReset = () => {
    chrome.storage.local.remove(["swarmRuntimeSnapshot", "swarmWorkflowNodes", "swarmLaunchRequest", "swarmDraftGoal", "swarmLifecycleSnapshot"])
      .then(() => {
        message.success("重置完成");
      })
      .catch((err) => {
        console.error("Reset failed:", err);
        message.error("重置失败");
      });
  };

  if (!hasSwarmRuntime) {
    const isMasterPlanning = lifecycle?.status === "dag_planning" || lifecycle?.status === "dag_ready" || lifecycle?.status === "swarm_starting";
    return (
       <Flex vertical align="center" justify="center" style={{ height: "100vh", background: "#f8fbff" }}>
          <Title level={3} style={{ color: "#1e293b", marginBottom: 24 }}>蜂群指挥台</Title>
          <Text type="secondary" style={{ marginBottom: 8 }}>
            {isMasterPlanning ? "主 Agent 正在侧边栏拆解 DAG，蜂群将在子 Agent 启动后显示。" : "当前没有正在执行的蜂群任务。请从侧边栏发起任务。"}
          </Text>
          {lifecycle?.goal && (
            <Text type="secondary" style={{ marginBottom: 32, maxWidth: 720, textAlign: "center" }}>
              {lifecycle.goal}
            </Text>
          )}
          <Button icon={<SyncOutlined />} onClick={() => window.location.reload()}>刷新状态</Button>
       </Flex>
    );
  }

  return (
    <Flex
      vertical
      style={{ height: "100vh", background: "#f1f5f9", overflow: "hidden" }}
    >
      <header style={{
        padding: "12px 24px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <Space size={16}>
          <div style={{ background: "#f0f7ff", padding: 8, borderRadius: 12, display: "flex" }}>
            <LayoutOutlined style={{ color: "#2563eb", fontSize: 18 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>蜂群全景监视器</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Sidepanel is the Master · Swarm Monitor Grid</Text>
          </div>
        </Space>

        <Space size={16}>
          <Badge status={agents.some(a => a.status === 'running') ? "processing" : "default"} text={
             agents.some(a => a.status === 'running') ? "正在同步实时状态" : "所有任务已就绪"
          } />
          <Button danger type="text" onClick={handleReset}>停止并重置</Button>
        </Space>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <Row gutter={[20, 20]}>
          {agents.map(agent => (
            <Col key={agent.nodeId} xs={24} sm={12} lg={8} xl={6}>
              <div style={{ height: "500px" }}>
                <AgentMonitorCard agent={agent} workflowNodes={workflowNodes} />
              </div>
            </Col>
          ))}
        </Row>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes swarm-bee-flying {
          0%, 100% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(-2px) rotate(-8deg); }
          75% { transform: translateY(2px) rotate(8deg); }
        }
        .swarm-bee-flying {
          display: inline-block;
          animation: swarm-bee-flying 0.6s ease-in-out infinite;
        }
      `}} />
    </Flex>
  );
};
