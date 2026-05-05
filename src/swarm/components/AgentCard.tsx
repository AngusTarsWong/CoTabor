import React, { useEffect, useState } from "react";
import { Card, Flex, Space, Tag, Typography, Button, Tooltip } from "antd";
import {
  LinkOutlined,
  WarningFilled,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot, ObservedSubAgentStatus } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface AgentCardProps {
  agent: SubAgentRuntimeSnapshot;
  isSelected: boolean;
  onClick: () => void;
}

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 0.1) return "0s";
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${Math.round(s)}s`;
}

const DynamicTimer: React.FC<{ startTs: number }> = ({ startTs }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <span>{formatDuration(Math.max(0, now - startTs))}</span>;
};

const statusMeta: Record<ObservedSubAgentStatus, { color: string; icon: React.ReactNode; label: string }> = {
  starting:  { color: "#d9d9d9", icon: <ClockCircleOutlined />, label: "准备中" },
  running:   { color: "#1677ff", icon: <LoadingOutlined spin />, label: "运行中" },
  stopping:  { color: "#fa8c16", icon: <ClockCircleOutlined />, label: "停止中" },
  success:   { color: "#52c41a", icon: <CheckCircleFilled />,  label: "已完成" },
  failed:    { color: "#ff4d4f", icon: <CloseCircleFilled />,  label: "失败" },
  stopped:   { color: "#8c8c8c", icon: <CloseCircleFilled />,  label: "已停止" },
};

export const AgentCard: React.FC<AgentCardProps> = ({ agent, isSelected, onClick }) => {
  const meta = statusMeta[agent.status];
  const hasIntervention = agent.humanRequest != null;
  const borderColor = hasIntervention ? "#ff4d4f" : (isSelected ? "#1677ff" : "transparent");

  const jumpToTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.tabId != null) {
      chrome.tabs.update(agent.tabId, { active: true }).catch(() => {});
    }
  };

  const goIntervene = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.tabId != null) {
      chrome.tabs.update(agent.tabId, { active: true }).catch(() => {});
    }
  };

  return (
    <Card
      size="small"
      onClick={onClick}
      style={{
        borderRadius: 12,
        borderLeft: `4px solid ${meta.color}`,
        border: `1px solid ${borderColor}`,
        borderLeftColor: hasIntervention ? "#ff4d4f" : meta.color,
        cursor: "pointer",
        transition: "border-color 0.2s",
        background: hasIntervention ? "#fff2f0" : isSelected ? "#f0f7ff" : "#fff",
      }}
      bodyStyle={{ padding: "10px 14px" }}
    >
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center">
          <Space size={6}>
            <span style={{ color: meta.color }}>{meta.icon}</span>
            <Text strong style={{ fontSize: 13, color: "#111827" }}>
              {agent.title ?? agent.nodeId}
            </Text>
          </Space>
          <Space size={4}>
            <Tag
              color={
                agent.status === "success" ? "success" :
                agent.status === "failed" ? "error" :
                agent.status === "running" ? "processing" : "default"
              }
              style={{ borderRadius: 999, fontSize: 11, marginInlineEnd: 0 }}
            >
              {meta.label}
            </Tag>
            {agent.status === "running" && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <DynamicTimer startTs={agent.startedAt} />
              </Text>
            )}
          </Space>
        </Flex>

        {agent.currentUrl && (
          <Flex align="center" gap={4}>
            <LinkOutlined style={{ color: "#6b7280", fontSize: 11 }} />
            <Text
              type="secondary"
              style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}
              title={agent.currentUrl}
            >
              {agent.currentUrl}
            </Text>
            {agent.tabId != null && (
              <Tooltip title="跳转到此 Tab">
                <Button type="link" size="small" style={{ padding: 0, height: "auto", fontSize: 11 }} onClick={jumpToTab}>
                  跳转
                </Button>
              </Tooltip>
            )}
          </Flex>
        )}

        {agent.currentStep && !hasIntervention && (
          <Text style={{ fontSize: 12, color: "#374151" }} ellipsis={{ tooltip: agent.currentStep }}>
            {agent.currentStep}
          </Text>
        )}

        {agent.summarySoFar && agent.status === "success" && (
          <Text style={{ fontSize: 12, color: "#374151" }} ellipsis={{ tooltip: agent.summarySoFar }}>
            {agent.summarySoFar}
          </Text>
        )}

        {agent.error && agent.status === "failed" && (
          <Text style={{ fontSize: 12, color: "#cf1322" }} ellipsis={{ tooltip: agent.error }}>
            {agent.error}
          </Text>
        )}

        {hasIntervention && agent.humanRequest && (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Flex align="start" gap={6}>
              <WarningFilled style={{ color: "#ff4d4f", fontSize: 13, marginTop: 2 }} />
              <Text style={{ fontSize: 12, color: "#cf1322", flex: 1 }}>
                {agent.humanRequest.message}
              </Text>
            </Flex>
            {agent.tabId != null && (
              <Button
                type="primary"
                danger
                size="small"
                style={{ borderRadius: 8, width: "100%" }}
                onClick={goIntervene}
              >
                ⚡ 立即前往处理
              </Button>
            )}
          </Space>
        )}
      </Space>
    </Card>
  );
};
