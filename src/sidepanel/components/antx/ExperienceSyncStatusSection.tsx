import React from "react";
import { Flex, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { ExperienceSyncDetails } from "../../../shared/types/memory";

const { Text } = Typography;

interface ExperienceSyncStatusSectionProps {
  syncDetails?: ExperienceSyncDetails;
}

function RenderStatusTag({ status }: { status: "pending" | "synced" | "failed" }) {
  const { t } = useTranslation('sidepanel');
  if (status === "synced") return <Tag color="success">{t('sync.synced')}</Tag>;
  if (status === "failed") return <Tag color="error">{t('sync.failed')}</Tag>;
  return <Tag color="default">{t('sync.pending')}</Tag>;
}

export const ExperienceSyncStatusSection: React.FC<ExperienceSyncStatusSectionProps> = ({ syncDetails }) => {
  const { t } = useTranslation('sidepanel');
  if (!syncDetails) return null;

  return (
    <div>
      <Text strong>{t('sync.status')}</Text>
      <div
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
        }}
      >
        <Flex vertical gap={8}>
          {!!syncDetails.notionSync && (
            <>
              <Flex align="center" gap={8} wrap="wrap">
                <Text>Notion</Text>
                <RenderStatusTag status={syncDetails.notionSync.status} />
              </Flex>
              {!!syncDetails.notionSync.error && (
                <Text type="danger">{t('sync.reason', { error: syncDetails.notionSync.error })}</Text>
              )}
              {!!syncDetails.notionSync.issues?.length && (
                <Flex vertical gap={4}>
                  {syncDetails.notionSync.issues.map((issue, index) => (
                    <Text key={`${issue}-${index}`} type="danger">
                      {issue}
                    </Text>
                  ))}
                </Flex>
              )}
            </>
          )}

          <Flex align="center" gap={8} wrap="wrap">
            <Text>TaskRuns</Text>
            <RenderStatusTag status={syncDetails.taskRuns.status} />
          </Flex>
          {!!syncDetails.taskRuns.error && (
            <Text type="danger">{t('sync.reason', { error: syncDetails.taskRuns.error })}</Text>
          )}

          <Flex align="center" gap={8} wrap="wrap">
            <Text>RawTraces</Text>
            <RenderStatusTag status={syncDetails.rawTraces.status} />
            {typeof syncDetails.rawTraces.syncedCount === "number" && (
              <Text type="secondary">
                {t('sync.details', { 
                  synced: syncDetails.rawTraces.syncedCount, 
                  failed: syncDetails.rawTraces.failedCount || 0, 
                  pending: syncDetails.rawTraces.pendingCount || 0 
                })}
              </Text>
            )}
          </Flex>
          {!!syncDetails.rawTraces.error && (
            <Text type="danger">{t('sync.reason', { error: syncDetails.rawTraces.error })}</Text>
          )}
        </Flex>
      </div>
    </div>
  );
};
