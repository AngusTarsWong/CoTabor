import React, { useState, useEffect } from "react";
import { Flex, Typography, Input, Button, Space, Card } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;
const { TextArea } = Input;

interface SwarmLaunchPadProps {
  onLaunch: (goal: string) => void;
}

export const SwarmLaunchPad: React.FC<SwarmLaunchPadProps> = ({ onLaunch }) => {
  const [goal, setGoal] = useState("");

  useEffect(() => {
    chrome.storage.local.get("swarmDraftGoal").then((result) => {
      if (result.swarmDraftGoal) {
        setGoal(result.swarmDraftGoal);
        chrome.storage.local.remove("swarmDraftGoal").catch(() => {});
      }
    });
  }, []);

  const handleLaunch = () => {
    const trimmed = goal.trim();
    if (!trimmed) return;
    onLaunch(trimmed);
  };

  return (
    <Flex
      style={{ height: "100vh", background: "#f8fbff" }}
      align="center"
      justify="center"
    >
      <Card
        style={{
          width: 560,
          borderRadius: 20,
          boxShadow: "0 14px 40px rgba(15, 23, 42, 0.10)",
          border: "1px solid #dbeafe",
        }}
        bodyStyle={{ padding: 32 }}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Space direction="vertical" size={4}>
            <Title level={4} style={{ margin: 0, color: "#111827" }}>
              🐝 蜂群指挥台
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              多 Agent 并发执行，自动拆解复杂跨页面任务
            </Text>
          </Space>

          <TextArea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="描述你的任务目标，例如：搜集竞品定价信息并整理到 Notion..."
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{ borderRadius: 12, fontSize: 14 }}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleLaunch();
            }}
          />

          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={handleLaunch}
            disabled={!goal.trim()}
            style={{ width: "100%", borderRadius: 10, height: 44, fontSize: 15 }}
          >
            出动蜂群
          </Button>

          <Text type="secondary" style={{ fontSize: 12, textAlign: "center", display: "block" }}>
            按 ⌘Enter 快速启动 · 任务启动后请保持侧边栏打开
          </Text>
        </Space>
      </Card>
    </Flex>
  );
};
