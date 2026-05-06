import React from "react";
import { Flex, Progress, Button, Typography, Space, Tag } from "antd";
import { CloseCircleOutlined, ShrinkOutlined, ReloadOutlined, ThunderboltOutlined, HourglassOutlined, UserOutlined } from "@ant-design/icons";
import type { SubAgentRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";

const { Text } = Typography;

interface SwarmHeaderProps {
  taskName: string;
  agents: SubAgentRuntimeSnapshot[];
  isRunning: boolean;
  onStop?: () => void;
  onReset?: () => void;
}

function getOverallStatus(agents: SubAgentRuntimeSnapshot[]): "running" | "done" | "failed" {
  if (agents.some(a => a.status === "failed")) return "failed";
  if (agents.length > 0 && agents.every(a => a.status === "success" || a.status === "stopped")) return "done";
  return "running";
}

const StatItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <Flex align="center" gap={6} style={{ background: "#f1f5f9", padding: "4px 10px", borderRadius: 8 }}>
    <span style={{ color: "#64748b", fontSize: 12 }}>{icon}</span>
    <Text type="secondary" style={{ fontSize: 12, marginRight: 2 }}>{label}:</Text>
    <Text strong style={{ fontSize: 12, color: "#1e293b" }}>{value}</Text>
  </Flex>
);

export const SwarmHeader: React.FC<SwarmHeaderProps> = ({ taskName, agents, isRunning, onStop, onReset }) => {
  const completedCount = agents.filter(a => a.status === "success").length;
  const activeCount = agents.filter(a => a.status === "running" || a.status === "starting" || a.status === "replanning").length;
  const totalCount = agents.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  const overallStatus = getOverallStatus(agents);
  const isPlanning = agents.length === 0 && isRunning;

  // Calculate duration from earliest agent start
  const earliestStart = agents.length > 0 ? Math.min(...agents.map(a => a.startedAt)) : 0;
  const [now, setNow] = React.useState(Date.now());
  
  React.useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const durationStr = earliestStart > 0 
    ? `${Math.floor((now - earliestStart) / 1000)}s` 
    : "0s";

  const statusTag = () => {
    if (isPlanning) return <Tag color="warning" style={{ borderRadius: 999, padding: "0 12px" }}>规划中</Tag>;
    if (overallStatus === "done") return <Tag color="success" style={{ borderRadius: 999, padding: "0 12px" }}>已完成</Tag>;
    if (overallStatus === "failed") return <Tag color="error" style={{ borderRadius: 999, padding: "0 12px" }}>出现错误</Tag>;
    return <Tag color="processing" style={{ borderRadius: 999, padding: "0 12px" }}>运行中</Tag>;
  };

  return (
    <Flex
      align="center"
      gap={16}
      style={{
        padding: "14px 24px",
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        flexShrink: 0,
        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
      }}
    >
      <Space size={8}>
        <div style={{ background: "#2563eb", padding: "6px", borderRadius: 8, display: "flex" }}>
          <ThunderboltOutlined style={{ color: "#fff", fontSize: 16 }} />
        </div>
        <Text style={{ fontSize: 18, fontWeight: 800, color: "#1e293b", whiteSpace: "nowrap", letterSpacing: "-0.02em" }}>
          SWARM COCKPIT
        </Text>
      </Space>

      <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />

      <Text
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#475569",
          flex: "0 1 auto",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 260,
        }}
        title={taskName}
      >
        {taskName}
      </Text>

      <Flex align="center" gap={12} style={{ flex: 1, marginLeft: 12 }}>
        <Progress
          percent={isPlanning ? 10 : percent}
          size="small"
          showInfo={false}
          strokeColor={{ '0%': '#2563eb', '100%': '#4f46e5' }}
          status={isPlanning ? "active" : "normal"}
          style={{ width: "100%", maxWidth: 160, margin: 0 }}
        />
        <Text strong style={{ fontSize: 13, color: "#64748b", minWidth: 40 }}>
          {isPlanning ? "..." : `${percent}%`}
        </Text>
        
        <Space size={8} style={{ marginLeft: 8 }}>
          <StatItem icon={<UserOutlined />} label="活跃" value={isPlanning ? "准备中" : activeCount} />
          <StatItem icon={<HourglassOutlined />} label="耗时" value={durationStr} />
        </Space>
      </Flex>

      <Space size={8}>
        {statusTag()}

        {!isRunning && onReset && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onReset}
            style={{ borderRadius: 6, fontWeight: 600 }}
          >
            新建任务
          </Button>
        )}

        {isRunning && onStop && (
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={onStop}
            style={{ borderRadius: 6, fontWeight: 600 }}
          >
            停止
          </Button>
        )}
        <Button
          size="small"
          icon={<ShrinkOutlined />}
          onClick={() => window.close()}
          style={{ borderRadius: 6, fontWeight: 600 }}
        >
          收起
        </Button>
      </Space>
    </Flex>
  );
};
