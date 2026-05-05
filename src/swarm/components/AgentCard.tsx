import React, { useEffect, useState } from "react";
import { Card, Flex, Space, Tag, Typography, Button, Tooltip } from "antd";
import {
  LinkOutlined,
  WarningFilled,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot, ObservedSubAgentStatus } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface AgentCardProps {
  agent: SubAgentRuntimeSnapshot;
  isSelected: boolean;
  onClick: () => void;
  onRetry?: (nodeId: string) => void;
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
  waiting:    { color: "#d9d9d9", icon: <ClockCircleOutlined />,  label: "等待中" },
  starting:   { color: "#d9d9d9", icon: <ClockCircleOutlined />,  label: "准备中" },
  running:    { color: "#1677ff", icon: <LoadingOutlined spin />,  label: "运行中" },
  replanning: { color: "#fa8c16", icon: <SyncOutlined spin />,     label: "重规划中" },
  stopping:   { color: "#fa8c16", icon: <ClockCircleOutlined />,   label: "停止中" },
  success:    { color: "#52c41a", icon: <CheckCircleFilled />,     label: "已完成" },
  failed:     { color: "#ff4d4f", icon: <CloseCircleFilled />,     label: "失败" },
  stopped:    { color: "#8c8c8c", icon: <CloseCircleFilled />,     label: "已停止" },
};

// Pulse keyframes injected once into the document head.
if (typeof document !== "undefined" && !document.getElementById("swarm-pulse-style")) {
  const style = document.createElement("style");
  style.id = "swarm-pulse-style";
  style.textContent = `
    @keyframes swarm-pulse {
      0%, 100% { border-color: #ff4d4f; box-shadow: 0 0 0 0 rgba(255,77,79,0.4); }
      50% { border-color: #ff7875; box-shadow: 0 0 0 6px rgba(255,77,79,0); }
    }
    .swarm-intervention-pulse {
      animation: swarm-pulse 1.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, isSelected, onClick, onRetry }) => {
  const meta = statusMeta[agent.status];
  const hasIntervention = agent.humanRequest != null;
  const isWaiting = agent.status === "waiting";
  const isReplanning = agent.status === "replanning";
  const isFailed = agent.status === "failed";

  const borderBase = hasIntervention ? "#ff4d4f" : isSelected ? "#1677ff" : "#f0f0f0";
  const bgColor = hasIntervention ? "#fff2f0" : isSelected ? "#f0f7ff" : "#fff";

  const jumpToTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.tabId != null) chrome.tabs.update(agent.tabId, { active: true }).catch(() => {});
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(agent.nodeId);
  };

  return (
    <Card
      size="small"
      onClick={onClick}
      className={hasIntervention ? "swarm-intervention-pulse" : undefined}
      style={{
        borderRadius: 12,
        borderLeft: `4px solid ${hasIntervention ? "#ff4d4f" : meta.color}`,
        border: `1px solid ${borderBase}`,
        borderLeftColor: hasIntervention ? "#ff4d4f" : meta.color,
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
        background: bgColor,
      }}
      bodyStyle={{ padding: "10px 14px" }}
    >
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        {/* Header row */}
        <Flex justify="space-between" align="center">
          <Space size={6}>
            <span style={{ color: hasIntervention ? "#ff4d4f" : meta.color }}>{meta.icon}</span>
            <Text strong style={{ fontSize: 13, color: "#111827" }}>
              {agent.title ?? agent.nodeId}
            </Text>
          </Space>
          <Space size={4}>
            <Tag
              color={
                hasIntervention ? "error" :
                agent.status === "success" ? "success" :
                agent.status === "failed" ? "error" :
                agent.status === "running" ? "processing" :
                agent.status === "replanning" ? "warning" : "default"
              }
              style={{ borderRadius: 999, fontSize: 11, marginInlineEnd: 0 }}
            >
              {hasIntervention ? "需要介入" : meta.label}
            </Tag>
            {agent.status === "running" && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <DynamicTimer startTs={agent.startedAt} />
              </Text>
            )}
          </Space>
        </Flex>

        {/* Waiting for dependencies */}
        {isWaiting && agent.waitingFor && agent.waitingFor.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            需要完成：{agent.waitingFor.join(" · ")}
          </Text>
        )}

        {/* Replanning notice */}
        {isReplanning && (
          <Text style={{ fontSize: 12, color: "#d46b08" }}>
            Replanner 正在重新规划...
          </Text>
        )}

        {/* Current URL + jump */}
        {agent.currentUrl && !isWaiting && !isReplanning && (
          <Flex align="center" gap={4}>
            <LinkOutlined style={{ color: "#6b7280", fontSize: 11 }} />
            <Text
              type="secondary"
              style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}
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

        {/* Running: current step */}
        {agent.currentStep && agent.status === "running" && !hasIntervention && (
          <Text style={{ fontSize: 12, color: "#374151" }} ellipsis={{ tooltip: agent.currentStep }}>
            {agent.currentStep}
          </Text>
        )}

        {/* Completed: summary */}
        {agent.summarySoFar && agent.status === "success" && (
          <Text style={{ fontSize: 12, color: "#374151" }} ellipsis={{ tooltip: agent.summarySoFar }}>
            {agent.summarySoFar}
          </Text>
        )}

        {/* Failed: error + retry */}
        {isFailed && (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            {agent.error && (
              <Text style={{ fontSize: 12, color: "#cf1322" }} ellipsis={{ tooltip: agent.error }}>
                {agent.error}
              </Text>
            )}
            {onRetry && (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                style={{ borderRadius: 8, width: "100%" }}
                onClick={handleRetry}
              >
                重试
              </Button>
            )}
          </Space>
        )}

        {/* Intervention */}
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
                onClick={jumpToTab}
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
