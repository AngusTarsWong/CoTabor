import React from "react";
import { Button, Card, Space, Typography } from "antd";
import { Welcome } from "@ant-design/x";
import { HistoryOutlined, RobotOutlined } from "@ant-design/icons";
import { IntegrationStatus } from "../../../shared/storage/integration-status";
import { CapabilityIntroCard } from "./welcome/CapabilityIntroCard";
import { HealthCheckCard } from "./welcome/HealthCheckCard";
import { HealthSummaryAlert } from "./welcome/HealthSummaryAlert";
import type { SidepanelSessionSnapshotSummary } from "../../hooks/useSidepanelSessionSnapshot";

const { Text } = Typography;

interface CotaborWelcomeProps {
  setAgentGoal: (goal: string) => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
  sessionSnapshot?: SidepanelSessionSnapshotSummary | null;
  onRestoreSession?: () => void;
  onDiscardSession?: () => void;
}

const TypewriterTitle: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = React.useState("");
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text.charAt(index));
        setIndex(index + 1);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [index, text]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {displayedText}
      <span
        style={{
          display: index < text.length ? "inline-block" : "none",
          width: 4,
          height: "1em",
          background: "#1677ff",
          marginLeft: 4,
          animation: "blink 1s step-end infinite",
        }}
      />
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}
      </style>
    </span>
  );
};

export const CotaborWelcome: React.FC<CotaborWelcomeProps> = ({
  setAgentGoal,
  integrationStatus,
  openOptions,
  currentTabTitle,
  sessionSnapshot,
  onRestoreSession,
  onDiscardSession,
}) => {
  const savedAtText = sessionSnapshot
    ? new Date(sessionSnapshot.savedAt).toLocaleString()
    : "";
  const sessionTarget = sessionSnapshot?.boundTabTitle || sessionSnapshot?.boundTabUrl || "未绑定页面";

  return (
    <div style={{ margin: "0 auto", width: "100%", maxWidth: 520, paddingBottom: 12 }}>
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <Welcome
          variant="borderless"
          icon={<RobotOutlined style={{ fontSize: 32, color: '#1677ff' }} />}
          title={<TypewriterTitle text="你好，我是 CoTabor" />}
          description={
            <div style={{ marginTop: 12 }}>
              <HealthSummaryAlert
                integrationStatus={integrationStatus}
                currentTabTitle={currentTabTitle}
              />
            </div>
          }
        />

        {sessionSnapshot && (
          <Card
            size="small"
            style={{
              borderRadius: 18,
              border: "1px solid #bfdbfe",
              background: "linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%)",
              boxShadow: "0 10px 24px rgba(37, 99, 235, 0.08)",
            }}
            bodyStyle={{ padding: "14px 16px" }}
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Space align="center" size={8}>
                <HistoryOutlined style={{ color: "#2563eb" }} />
                <Text strong>继续上次任务</Text>
              </Space>
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                <Text style={{ color: "#475569", fontSize: 13 }}>
                  {sessionSnapshot.nodeCount > 0
                    ? `已记录 ${sessionSnapshot.nodeCount} 个执行节点`
                    : `已记录 ${sessionSnapshot.messageCount} 条消息`}
                  {sessionSnapshot.draftGoal ? "，包含未发送输入草稿" : ""}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  页面：{sessionTarget}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  保存时间：{savedAtText}
                </Text>
                {(sessionSnapshot.wasRunning || sessionSnapshot.wasStopping) && (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    上次关闭时任务仍在进行中，恢复后仅显示界面记录。
                  </Text>
                )}
              </Space>
              <Space style={{ width: "100%" }}>
                <Button type="primary" onClick={onRestoreSession}>
                  恢复记录
                </Button>
                <Button onClick={onDiscardSession}>
                  丢弃记录
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        <HealthCheckCard
          integrationStatus={integrationStatus}
          currentTabTitle={currentTabTitle}
          openOptions={openOptions}
        />

        <CapabilityIntroCard onSelectTask={setAgentGoal} />
      </Space>
    </div>
  );
};
