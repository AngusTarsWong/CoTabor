import React, { useState } from "react";
import { Flex, Splitter, message, Drawer, Descriptions, Tag, Space, Typography, Button, Divider } from "antd";
import { 
  HistoryOutlined, 
  InfoCircleOutlined, 
  BlockOutlined, 
  ClockCircleOutlined,
  GlobalOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import { SwarmHeader } from "./components/SwarmHeader";
import { InterventionBanner } from "./components/InterventionBanner";
import { AgentCardList } from "./components/AgentCardList";
import { SwarmThoughtChain } from "./components/SwarmThoughtChain";
import { SwarmLaunchPad } from "./components/SwarmLaunchPad";
import { useSwarmRuntime } from "./useSwarmRuntime";

const { Text, Title, Paragraph } = Typography;

export const SwarmApp: React.FC = () => {
  const { snapshot, workflowNodes, launchRequest } = useSwarmRuntime();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);

  const agents = snapshot?.agents ?? [];
  // isPlanning is true if we have a launchRequest but no agents yet, or if workflowNodes are present but no agents.
  const isPlanning = agents.length === 0 && (!!launchRequest || workflowNodes.length > 0);
  const isSwarmActive = agents.length > 0 || isPlanning;
  const detailAgent = agents.find(a => a.nodeId === detailNodeId);

  const handleLaunch = (goal: string) => {
    chrome.storage.local
      .set({ swarmLaunchRequest: { goal, executionMode: "isolated_tabs", timestamp: Date.now() } })
      .catch((err) => {
        console.error("Launch failed:", err);
        message.error("启动失败，请检查插件状态");
      });
  };

  const handleReset = () => {
    chrome.storage.local.remove(["swarmRuntimeSnapshot", "swarmWorkflowNodes", "swarmLaunchRequest"])
      .then(() => {
        // useSwarmRuntime will automatically update via storage listener
        setSelectedNodeId(null);
        setDetailNodeId(null);
      })
      .catch((err) => {
        console.error("Reset failed:", err);
        message.error("重置失败");
      });
  };

  if (!isSwarmActive) {
    return <SwarmLaunchPad onLaunch={handleLaunch} />;
  }

  const taskName = workflowNodes[0]?.nodeName ?? "蜂群任务";
  const isRunning = agents.some(a => a.status === "running" || a.status === "starting") || isPlanning;

  return (
    <Flex
      vertical
      style={{ height: "100vh", background: "#f8fbff", overflow: "hidden" }}
    >
      <SwarmHeader
        taskName={taskName}
        agents={agents}
        isRunning={isRunning}
        onReset={handleReset}
      />

      <InterventionBanner agents={agents} />

      <Flex flex={1} style={{ overflow: "hidden" }}>
        <Splitter>
          <Splitter.Panel defaultSize="62%" min="30%" max="80%">
            <div
              style={{
                height: "100%",
                overflowY: "auto",
                padding: "16px 16px 16px 20px",
              }}
            >
              {isPlanning ? (
                <Flex vertical align="center" justify="center" style={{ height: "100%", opacity: 0.6 }}>
                  <Space direction="vertical" align="center" size={16}>
                    <div className="swarm-planning-spinner" />
                    <Text strong style={{ fontSize: 16, color: "#475569" }}>正在根据目标自动规划 DAG...</Text>
                    <Text type="secondary">系统正在拆解任务并分配 Agent，请稍候</Text>
                  </Space>
                </Flex>
              ) : (
                <AgentCardList
                  agents={agents}
                  selectedNodeId={selectedNodeId}
                  onSelectAgent={setSelectedNodeId}
                  onOpenDetail={setDetailNodeId}
                />
              )}
            </div>
          </Splitter.Panel>

          <Splitter.Panel>
            <div
              style={{
                height: "100%",
                overflowY: "auto",
                padding: "16px 20px 16px 16px",
                background: "#fff",
              }}
            >
              <SwarmThoughtChain
                agents={agents}
                workflowNodes={workflowNodes}
                selectedNodeId={selectedNodeId}
                onSelectAgent={setSelectedNodeId}
              />
            </div>
          </Splitter.Panel>
        </Splitter>
      </Flex>

      <Drawer
        title={
          <Space>
            <InfoCircleOutlined style={{ color: "#2563eb" }} />
            <span>Agent 详情: {detailAgent?.title ?? detailAgent?.nodeId}</span>
          </Space>
        }
        placement="right"
        onClose={() => setDetailNodeId(null)}
        open={!!detailNodeId}
        width={500}
        extra={
          detailAgent?.tabId && (
            <Button 
              type="primary" 
              size="small" 
              onClick={() => chrome.tabs.update(detailAgent.tabId!, { active: true })}
            >
              跳转到 Tab
            </Button>
          )
        }
      >
        {detailAgent ? (
          <Space direction="vertical" size={24} style={{ width: "100%" }}>
            <Descriptions title="基础信息" bordered column={1} size="small">
              <Descriptions.Item label="节点 ID">{detailAgent.nodeId}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={
                  detailAgent.status === 'success' ? 'success' :
                  detailAgent.status === 'failed' ? 'error' :
                  detailAgent.status === 'running' ? 'processing' : 'default'
                }>
                  {detailAgent.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tab ID">{detailAgent.tabId ?? 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="启动时间">{new Date(detailAgent.startedAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            <section>
              <Title level={5}><GlobalOutlined /> 当前 URL</Title>
              <Paragraph copyable style={{ background: "#f8fafc", padding: 8, borderRadius: 4 }}>
                {detailAgent.currentUrl ?? '暂无'}
              </Paragraph>
            </section>

            <section>
              <Title level={5}><HistoryOutlined /> 当前步骤</Title>
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
                <Text>{detailAgent.currentStep ?? '等待执行...'}</Text>
              </div>
            </section>

            {detailAgent.error && (
              <section>
                <Title level={5} style={{ color: "#ef4444" }}><ExclamationCircleOutlined /> 错误信息</Title>
                <div style={{ background: "#fef2f2", padding: 12, borderRadius: 8, border: "1px solid #fecaca" }}>
                  <Text type="danger">{detailAgent.error}</Text>
                </div>
              </section>
            )}

            {detailAgent.summarySoFar && (
              <section>
                <Title level={5}><CheckCircleOutlined /> 执行阶段性总结</Title>
                <Paragraph style={{ background: "#f0fdf4", padding: 12, borderRadius: 8 }}>
                  {detailAgent.summarySoFar}
                </Paragraph>
              </section>
            )}

            <Divider />
            
            <Flex justify="space-between">
              <Text type="secondary">重试次数: {detailAgent.retryCount}</Text>
              <Text type="secondary">重规划次数: {detailAgent.replanCount}</Text>
            </Flex>
          </Space>
        ) : (
          <Text type="secondary">未找到 Agent 数据</Text>
        )}
      </Drawer>
    </Flex>
  );
};
