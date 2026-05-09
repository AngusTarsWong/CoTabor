import React from "react";
import { Typography } from "antd";
import { Prompts } from "@ant-design/x";
import { BulbOutlined, ThunderboltOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

interface CapabilityIntroCardProps {
  onSelectTask: (task: string) => void;
  agentMode?: string;
}

export const CapabilityIntroCard: React.FC<CapabilityIntroCardProps> = ({ onSelectTask, agentMode }) => {
  const { t } = useTranslation('welcome');

  const quickTasks: string[] = React.useMemo(() => {
    if (agentMode === 'swarm') {
      return ["请从百度、谷歌两个平台检索关于阿里巴巴的新闻"];
    }
    return t('capability.tasks', { returnObjects: true }) as string[];
  }, [t, agentMode]);

  // Assign random icons just for better visual representation
  const icons = [<BulbOutlined key="icon-bulb" />, <ThunderboltOutlined key="icon-thunder" />, <SearchOutlined key="icon-search" />];

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
