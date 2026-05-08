import React, { useMemo, useState, useEffect } from "react";
import { Flex, Typography, Tag, Space, Button, Tooltip } from "antd";
import { GlobalOutlined, ExportOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { UnifiedAgentState } from "../../types/agent-view-model";

const { Text } = Typography;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const StatusIcon: React.FC<{ status: UnifiedAgentState["status"]; hasIntervention: boolean }> = ({ status, hasIntervention }) => {
  if (hasIntervention) return <span style={{ fontSize: 18 }}>🚨</span>;

  switch (status) {
    case "success": return <span style={{ fontSize: 18 }}>🐝</span>;
    case "failed": return <span style={{ fontSize: 18 }}>🥀</span>;
    case "running":
    case "starting":
    case "replanning":
      return <span className="swarm-bee-flying" style={{ fontSize: 18 }}>🐝</span>;
    case "stopping": return <span style={{ fontSize: 18, opacity: 0.5 }}>🐝</span>;
    case "stopped": return <span style={{ fontSize: 18 }}>💤</span>;
    case "waiting": return <span style={{ fontSize: 18, opacity: 0.3 }}>🐝</span>;
    default: return <span style={{ fontSize: 18, opacity: 0.4 }}>🐝</span>;
  }
};

export interface AgentHeaderProps {
  agent: UnifiedAgentState;
  layout: 'sidepanel' | 'cockpit-card';
}

export const AgentHeader: React.FC<AgentHeaderProps> = ({ agent, layout }) => {
  const isTerminal = agent.status === 'success' || agent.status === 'failed' || agent.status === 'stopped';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  const elapsedMs = isTerminal
    ? agent.updatedAt - agent.startedAt
    : now - agent.startedAt;

  const hostname = useMemo(() => {
    if (!agent.currentUrl) return null;
    try {
      return new URL(agent.currentUrl).hostname;
    } catch {
      return null;
    }
  }, [agent.currentUrl]);

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Space size={8}>
          <StatusIcon status={agent.status} hasIntervention={!!agent.humanRequest} />
          <Text strong style={{ fontSize: layout === 'sidepanel' ? 16 : 14 }}>
            {agent.title}
          </Text>
        </Space>
        <Tag color={
          agent.status === 'success' ? 'success' :
          agent.status === 'failed' ? 'error' :
          agent.status === 'running' ? 'processing' :
          agent.status === 'replanning' ? 'warning' :
          agent.status === 'waiting' ? 'default' : 'default'
        } style={{ borderRadius: 12, margin: 0 }}>
          {agent.status}
        </Tag>
      </Flex>

      <Flex justify="space-between" align="center" style={{ background: "#f8fafc", padding: "6px 10px", borderRadius: 8 }}>
        <Space size={12}>
          {hostname && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <GlobalOutlined style={{ marginRight: 4 }} />
              {hostname}
            </Text>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {formatElapsed(elapsedMs)}
          </Text>
        </Space>
        
        {agent.tabId && (
          <Tooltip title="跳转到对应标签页">
            <Button
              type="link"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => chrome.tabs.update(agent.tabId!, { active: true })}
              style={{ padding: 0, height: "auto", fontSize: 12 }}
            >
              跳转
            </Button>
          </Tooltip>
        )}
      </Flex>
    </Space>
  );
};
