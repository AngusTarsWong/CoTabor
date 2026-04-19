import React from "react";
import { BulbOutlined, ClockCircleOutlined, DownOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, Flex, Space, Typography } from "antd";
import { ExperienceUiState } from "../../types/experience-ui";

const { Paragraph, Text, Title } = Typography;

interface ExperienceStatusDrawerProps {
  state: ExperienceUiState | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function renderStatusIcon(status: ExperienceUiState["status"]) {
  if (status === "completed") return <BulbOutlined style={{ color: "#10b981" }} />;
  if (status === "failed") return <ExclamationCircleOutlined style={{ color: "#d97706" }} />;
  return <ClockCircleOutlined style={{ color: "#9ca3af" }} />;
}

function renderStatusText(state: ExperienceUiState): string {
  if (state.status === "queued") return "经验任务已加入后台处理队列";
  if (state.status === "running") return "经验总结处理中...";
  if (state.status === "failed") return `经验总结失败，等待重试：${state.error || "未知错误"}`;
  if (state.committed) {
    return `经验已保存：L1 ${state.committed.L1} · L2 ${state.committed.L2} · L3 ${state.committed.L3}`;
  }
  return state.text;
}

export const ExperienceStatusDrawer: React.FC<ExperienceStatusDrawerProps> = ({
  state,
  open,
  onOpen,
  onClose,
}) => {
  if (!state?.visible) return null;

  return (
    <>
      <div
        style={{
          color: state.status === "failed" ? "#b45309" : "#6b7280",
          fontSize: 13,
          textAlign: "center",
          margin: "4px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {renderStatusIcon(state.status)}
        <span>{renderStatusText(state)}</span>
        <Button
          type="text"
          size="small"
          icon={<DownOutlined rotate={open ? 180 : 0} />}
          onClick={open ? onClose : onOpen}
          style={{ color: "#6b7280", paddingInline: 4 }}
        />
      </div>

      <Drawer
        title="经验处理详情"
        placement="bottom"
        height={520}
        open={open}
        onClose={onClose}
        destroyOnClose={false}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <Text strong>处理状态</Text>
            <Paragraph style={{ marginBottom: 0, marginTop: 6 }}>{renderStatusText(state)}</Paragraph>
            {typeof state.synced === "boolean" && (
              <Text type="secondary">
                {state.synced ? "TaskRuns / RawTraces 已同步到 Notion" : "TaskRuns / RawTraces 已保存到本地，等待同步到 Notion"}
              </Text>
            )}
          </div>

          {!!state.globalSummary && (
            <div>
              <Text strong>总结摘要</Text>
              <Paragraph style={{ marginBottom: 0, marginTop: 6 }}>{state.globalSummary}</Paragraph>
            </div>
          )}

          <div>
            <Text strong>候选经验与提交结果</Text>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
              }}
            >
              <Flex vertical gap={6}>
                <Text>候选经验数：{state.candidates ?? 0}</Text>
                <Text>
                  提交结果：
                  {state.committed
                    ? ` L1 ${state.committed.L1} · L2 ${state.committed.L2} · L3 ${state.committed.L3} · DROP ${state.committed.DROP}`
                    : " 暂无"}
                </Text>
              </Flex>
            </div>
          </div>

          <div>
            <Text strong>提炼后的候选经验</Text>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 220,
                overflow: "auto",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {state.experienceBuffer ? JSON.stringify(state.experienceBuffer, null, 2) : "本次未提炼出可提交的候选经验。"}
            </pre>
          </div>

          <div>
            <Text strong>大模型原始输出</Text>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                background: "#111827",
                color: "#f9fafb",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 260,
                overflow: "auto",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {state.rawResponse || "未记录到本次总结模型输出。"}
            </pre>
          </div>

          {state.status === "failed" && (
            <div>
              <Text strong>失败原因</Text>
              <Paragraph type="danger" style={{ marginBottom: 0, marginTop: 6 }}>
                {state.error || "未知错误"}
              </Paragraph>
            </div>
          )}
        </Space>
      </Drawer>
    </>
  );
};
