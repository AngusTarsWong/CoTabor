import React from "react";
import { Flex, Progress, Button, Typography, Space, Tag } from "antd";
import { CloseCircleOutlined, ShrinkOutlined } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface SwarmHeaderProps {
  taskName: string;
  agents: SubAgentRuntimeSnapshot[];
  isRunning: boolean;
  onStop?: () => void;
}

function getOverallStatus(agents: SubAgentRuntimeSnapshot[]): "running" | "done" | "failed" {
  if (agents.some(a => a.status === "failed")) return "failed";
  if (agents.every(a => a.status === "success" || a.status === "stopped")) return "done";
  return "running";
}

export const SwarmHeader: React.FC<SwarmHeaderProps> = ({ taskName, agents, isRunning, onStop }) => {
  const completedCount = agents.filter(a => a.status === "success").length;
  const totalCount = agents.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const overallStatus = getOverallStatus(agents);

  const statusTag = () => {
    if (overallStatus === "done") return <Tag color="success" style={{ borderRadius: 999 }}>已完成</Tag>;
    if (overallStatus === "failed") return <Tag color="error" style={{ borderRadius: 999 }}>出现错误</Tag>;
    return <Tag color="processing" style={{ borderRadius: 999 }}>运行中</Tag>;
  };

  return (
    <Flex
      align="center"
      gap={16}
      style={{
        padding: "12px 20px",
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        flexShrink: 0,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
        🐝 蜂群指挥台
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: "#374151",
          flex: "0 1 auto",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 300,
        }}
        title={taskName}
      >
        {taskName}
      </Text>

      <Space align="center" style={{ flex: 1 }}>
        <Progress
          percent={percent}
          size="small"
          showInfo={false}
          strokeColor="#1677ff"
          style={{ minWidth: 120, maxWidth: 200 }}
        />
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          {completedCount}/{totalCount}
        </Text>
      </Space>

      {statusTag()}

      {isRunning && onStop && (
        <Button
          danger
          size="small"
          icon={<CloseCircleOutlined />}
          onClick={onStop}
          style={{ flexShrink: 0 }}
        >
          停止
        </Button>
      )}
      <Button
        size="small"
        icon={<ShrinkOutlined />}
        onClick={() => window.close()}
        style={{ flexShrink: 0 }}
      >
        收起
      </Button>
    </Flex>
  );
};
