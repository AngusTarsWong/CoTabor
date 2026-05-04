import React from "react";
import { Typography } from "antd";
import { Prompts } from "@ant-design/x";
import { BulbOutlined, ThunderboltOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

interface CapabilityIntroCardProps {
  onSelectTask: (task: string) => void;
}

export const CapabilityIntroCard: React.FC<CapabilityIntroCardProps> = ({ onSelectTask }) => {
  const { t } = useTranslation('welcome');

  const capabilities: string[] = t('capability.items', { returnObjects: true }) as string[];
  const quickTasks: string[]   = t('capability.tasks', { returnObjects: true }) as string[];

  // Assign random icons just for better visual representation
  const icons = [<BulbOutlined />, <ThunderboltOutlined />, <SearchOutlined />];

  const items = quickTasks.map((task, index) => ({
    key: `task-${index}`,
    icon: icons[index % icons.length],
    description: task,
  }));

  return (
    <div style={{ marginTop: 16 }}>
      <Text type="secondary" style={{ display: "block", marginBottom: 12, paddingLeft: 8 }}>
        {t('capability.quickTasksHint')}
      </Text>
      <Prompts
        items={items}
        onItemClick={(item) => onSelectTask(item.data.description as string)}
        wrap
      />
    </div>
  );
};
