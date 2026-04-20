import React from "react";
import { Button, Card, List, Space, Typography } from "antd";

const { Paragraph, Text } = Typography;

const CAPABILITIES = [
  "读取并总结当前页面内容",
  "提取关键信息并执行页面操作",
  "结合现有记忆、工具和技能完成多步骤任务",
];

const QUICK_TASKS = [
  "帮我总结当前页面",
  "提取这个页面的关键信息",
  "分析这页内容并给我下一步建议",
];

interface CapabilityIntroCardProps {
  onSelectTask: (task: string) => void;
}

export const CapabilityIntroCard: React.FC<CapabilityIntroCardProps> = ({ onSelectTask }) => {
  return (
    <Card
      title="CoTabor 可以帮你做什么"
      style={{ borderRadius: 20, boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)" }}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        CoTabor 会基于当前页面理解内容，并按你的目标执行浏览器内任务。
      </Paragraph>
      <List
        split={false}
        dataSource={CAPABILITIES}
        renderItem={(item) => (
          <List.Item style={{ padding: "8px 0" }}>
            <Text style={{ color: "#172033" }}>{item}</Text>
          </List.Item>
        )}
      />

      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
          可以直接点击这些示例填充到输入框
        </Text>
        <Space size={10} wrap>
          {QUICK_TASKS.map((task) => (
            <Button
              key={task}
              onClick={() => onSelectTask(task)}
              style={{ borderRadius: 999 }}
            >
              {task}
            </Button>
          ))}
        </Space>
      </div>
    </Card>
  );
};
