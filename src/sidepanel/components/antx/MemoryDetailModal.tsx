import React from "react";
import { Card, Collapse, Empty, Modal, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { NodeMemoryDetailItem, NodeMemoryDetails } from "../../../shared/types/memory";

const { Paragraph, Text } = Typography;

function displayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function PreBlock(props: { text: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 12,
        background: "#f8fafc",
        color: "#334155",
        border: "1px solid #e5e7eb",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 260,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {props.text}
    </pre>
  );
}

export const MemoryDetailModal: React.FC<{
  item: NodeMemoryDetailItem | null;
  refresh?: NodeMemoryDetails["refresh"];
  open: boolean;
  onClose: () => void;
}> = ({ item, refresh, open, onClose }) => {
  const { t } = useTranslation('sidepanel');
  return (
    <Modal
      title={item ? t('memory.detailTitle', { level: item.level }) : t('detail.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnClose
    >
      {!item ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('memory.noSelection')} />
      ) : (
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Card size="small" style={{ borderRadius: 14 }}>
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Space wrap>
                <Tag color={item.level === "L1" ? "green" : item.level === "L2" ? "blue" : "purple"}>
                  {item.level}
                </Tag>
                {item.memoryType === "anti_pattern" && <Tag color="red">{t('memory.antiPattern')}</Tag>}
                <Tag>{item.injectionSurface}</Tag>
              </Space>
              <Text strong>{item.title}</Text>
              <Paragraph style={{ marginBottom: 0, color: "#475569" }}>
                {item.summary || t('memory.noSummary')}
              </Paragraph>
            </Space>
          </Card>

          <Card size="small" title={t('memory.fullText')} style={{ borderRadius: 14 }}>
            <PreBlock text={item.fullText || t('detail.notRecorded')} />
          </Card>

          <Card size="small" title={t('memory.injectedText')} style={{ borderRadius: 14 }}>
            <PreBlock text={item.injectedText || t('detail.notRecorded')} />
          </Card>

          {refresh ? (
            <Card size="small" title={t('memory.refreshInfo')} style={{ borderRadius: 14 }}>
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Text>{t('memory.mode', { mode: refresh.mode || "unknown" })}</Text>
                {refresh.reason ? <Text>{t('memory.reason', { reason: refresh.reason })}</Text> : null}
                {refresh.staleReasons?.length ? (
                  <Text>{t('memory.trigger', { trigger: refresh.staleReasons.join(" / ") })}</Text>
                ) : null}
              </Space>
            </Card>
          ) : null}

          <Collapse
            items={[
              {
                key: "meta",
                label: t('memory.sourceMetadata'),
                children: <PreBlock text={displayText(item.sourceMeta || {}) || "{}"} />,
              },
            ]}
          />
        </Space>
      )}
    </Modal>
  );
};
