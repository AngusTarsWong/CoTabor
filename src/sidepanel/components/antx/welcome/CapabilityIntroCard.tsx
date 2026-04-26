import React from "react";
import { Button, Card, List, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

const { Paragraph, Text } = Typography;

interface CapabilityIntroCardProps {
  onSelectTask: (task: string) => void;
}

export const CapabilityIntroCard: React.FC<CapabilityIntroCardProps> = ({ onSelectTask }) => {
  const { t } = useTranslation('welcome');

  const capabilities: string[] = t('capability.items', { returnObjects: true }) as string[];
  const quickTasks: string[]   = t('capability.tasks', { returnObjects: true }) as string[];

  return (
    <Card
      title={t('capability.title')}
      style={{ borderRadius: 20, boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)" }}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        {t('capability.description')}
      </Paragraph>
      <List
        split={false}
        dataSource={capabilities}
        renderItem={(item) => (
          <List.Item style={{ padding: "8px 0" }}>
            <Text style={{ color: "#172033" }}>{item}</Text>
          </List.Item>
        )}
      />

      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
          {t('capability.quickTasksHint')}
        </Text>
        <Space size={10} wrap>
          {quickTasks.map((task) => (
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
