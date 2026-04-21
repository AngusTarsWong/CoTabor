import React from "react";
import { Flex, Tag, Typography } from "antd";
import { ExperienceSyncDetails } from "../../../shared/types/memory";

const { Text } = Typography;

interface ExperienceSyncStatusSectionProps {
  syncDetails?: ExperienceSyncDetails;
}

function renderStatusTag(status: "pending" | "synced" | "failed") {
  if (status === "synced") return <Tag color="success">已同步</Tag>;
  if (status === "failed") return <Tag color="error">同步失败</Tag>;
  return <Tag color="default">待同步</Tag>;
}

export const ExperienceSyncStatusSection: React.FC<ExperienceSyncStatusSectionProps> = ({ syncDetails }) => {
  if (!syncDetails) return null;

  return (
    <div>
      <Text strong>云端同步状态</Text>
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
                {renderStatusTag(syncDetails.notionSync.status)}
              </Flex>
              {!!syncDetails.notionSync.error && (
                <Text type="danger">失败原因：{syncDetails.notionSync.error}</Text>
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
            {renderStatusTag(syncDetails.taskRuns.status)}
          </Flex>
          {!!syncDetails.taskRuns.error && (
            <Text type="danger">失败原因：{syncDetails.taskRuns.error}</Text>
          )}

          <Flex align="center" gap={8} wrap="wrap">
            <Text>RawTraces</Text>
            {renderStatusTag(syncDetails.rawTraces.status)}
            {typeof syncDetails.rawTraces.syncedCount === "number" && (
              <Text type="secondary">
                已同步 {syncDetails.rawTraces.syncedCount} · 失败 {syncDetails.rawTraces.failedCount || 0} · 待同步{" "}
                {syncDetails.rawTraces.pendingCount || 0}
              </Text>
            )}
          </Flex>
          {!!syncDetails.rawTraces.error && (
            <Text type="danger">失败原因：{syncDetails.rawTraces.error}</Text>
          )}
        </Flex>
      </div>
    </div>
  );
};
