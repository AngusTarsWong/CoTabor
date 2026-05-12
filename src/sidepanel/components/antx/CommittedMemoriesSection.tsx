import React from "react";
import { Flex, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { CommittedMemoryDetail, MemoryLevel } from "../../../shared/types/memory";

const { Paragraph, Text } = Typography;

interface CommittedMemoriesSectionProps {
  committedMemories?: CommittedMemoryDetail[];
}

export const CommittedMemoriesSection: React.FC<CommittedMemoriesSectionProps> = ({ committedMemories }) => {
  const { t } = useTranslation('sidepanel');
  if (!committedMemories || committedMemories.length === 0) return null;

  const levelLabels: Record<MemoryLevel, string> = {
    L1: t('memory.l1'),
    L2: t('memory.l2'),
    L3: t('memory.l3'),
  };

  const grouped = committedMemories.reduce<Record<MemoryLevel, CommittedMemoryDetail[]>>(
    (acc, item) => {
      acc[item.level].push(item);
      return acc;
    },
    { L1: [], L2: [], L3: [] },
  );

  return (
    <div>
      <Text strong>{t('memory.finalSaved')}</Text>
      <Flex vertical gap={12} style={{ marginTop: 8 }}>
        {(Object.keys(grouped) as MemoryLevel[]).map((level) => {
          const items = grouped[level];
          if (items.length === 0) return null;

          return (
            <div
              key={level}
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
              }}
            >
              <Flex vertical gap={10}>
                <Flex align="center" gap={8} wrap="wrap">
                  <Text strong>{levelLabels[level]}</Text>
                  <Tag color="blue">{items.length}</Tag>
                </Flex>
                {items.map((item) => (
                  <div key={item.id}>
                    <Text strong>{item.title}</Text>
                    <Paragraph style={{ marginBottom: 0, marginTop: 4 }}>
                      {item.memoryText}
                    </Paragraph>
                  </div>
                ))}
              </Flex>
            </div>
          );
        })}
      </Flex>
    </div>
  );
};
