import React, { useMemo, useState, useEffect } from "react";
import { Flex, message, Typography, Button, Row, Col, Badge, Space } from "antd";
import {
  SyncOutlined,
  LayoutOutlined,
} from "@ant-design/icons";
import { useSwarmRuntime } from "./useSwarmRuntime";
import { buildWorkflowTree } from "../sidepanel/components/antx/workflow";
import { AgentMonitor } from "../shared/components/AgentMonitor";
import { UnifiedAgentState } from "../shared/types/agent-view-model";

const { Text, Title } = Typography;

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
          {agents.map(agent => {
            const agentTaskRunIds = [
              agent.taskRunId,
              agent.originalTaskRunId,
              agent.nodeId,
            ].filter((value): value is string => typeof value === "string" && value.length > 0);
            const agentViewModel: UnifiedAgentState = {
              ...agent,
              id: agent.nodeId,
              title: agent.title || agent.nodeId,
            };
            const subNodes = buildWorkflowTree(workflowNodes.filter(n => 
              !!n.taskRunId && agentTaskRunIds.includes(n.taskRunId)
            ));

            return (
              <Col key={agent.nodeId} xs={24} sm={12} lg={8} xl={6}>
                <div style={{ height: "500px" }}>
                  <AgentMonitor
                    agent={agentViewModel}
                    nodes={subNodes}
                    layout="cockpit-card"
                    filterTaskRunIds={agentTaskRunIds}
                  />
                </div>
              </Col>
            );
          })}
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
