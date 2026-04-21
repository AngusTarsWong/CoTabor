import React from "react";
import { BulbOutlined, ClockCircleOutlined, DownOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, Flex, Space, Tag, Typography } from "antd";
import { ExperienceUiState } from "../../types/experience-ui";
import { CommittedMemoriesSection } from "./CommittedMemoriesSection";
import { ExperienceSyncStatusSection } from "./ExperienceSyncStatusSection";

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
  if (state.status === "queued" || state.status === "running") return "经验总结处理中...";
  if (state.status === "failed") return `经验总结失败，等待重试：${state.error || "未知错误"}`;
  if (state.committed) {
    return `经验已保存：L1 ${state.committed.L1} · L2 ${state.committed.L2} · L3 ${state.committed.L3}`;
  }
  return state.text;
}

function renderPhaseLabel(state: ExperienceUiState): string {
  const phase = state.liveStatusSnapshot?.phase;
  if (phase === "queued") return "等待后台任务启动";
  if (phase === "summarizing") return "经验总结中";
  if (phase === "classifying") return "记忆分类与提交中";
  if (phase === "syncing") return "同步到 Notion";
  if (state.status === "completed") return "已完成";
  if (state.status === "failed") return "失败";
  return "处理中";
}

export const ExperienceStatusDrawer: React.FC<ExperienceStatusDrawerProps> = ({
  state,
  open,
  onOpen,
  onClose,
}) => {
  if (!state?.visible) return null;

  const showQueueNotice = state.status === "queued" || state.status === "running";
  const statusColor = state.status === "failed" ? "#b45309" : "#6b7280";

  return (
    <>
      <div
        style={{
          width: "100%",
          margin: "4px 0 8px",
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <Flex vertical gap={10} align="flex-start">
          {showQueueNotice && (
            <div
              style={{
                color: "#6b7280",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <BulbOutlined style={{ color: "#10b981" }} />
              <span>经验任务已加入后台处理队列</span>
            </div>
          )}

          <Button
            type="text"
            onClick={open ? onClose : onOpen}
            style={{
              padding: 0,
              height: "auto",
              color: statusColor,
            }}
          >
            <Flex align="center" gap={8}>
              {renderStatusIcon(state.status)}
              <span style={{ fontSize: 13 }}>{renderStatusText(state)}</span>
              <DownOutlined rotate={open ? 180 : 0} />
            </Flex>
          </Button>
        </Flex>
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
          </div>

          {(state.status === "queued" || state.status === "running") && (
            <>
              <div>
                <Text strong>当前阶段</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="processing">{renderPhaseLabel(state)}</Tag>
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                }}
              >
                <Flex vertical gap={6}>
                  <Text>阶段说明：{state.liveStatusSnapshot?.currentStepTitle || "正在准备经验处理上下文"}</Text>
                  {!!state.liveStatusSnapshot?.currentModel && (
                    <Text>当前模型：{state.liveStatusSnapshot.currentModel}</Text>
                  )}
                  {typeof state.liveStatusSnapshot?.candidateCountSoFar === "number" && (
                    <Text>候选经验数：{state.liveStatusSnapshot.candidateCountSoFar}</Text>
                  )}
                  {!!state.liveStatusSnapshot?.committedCountsSoFar && (
                    <Text>
                      已提交进度：L1 {state.liveStatusSnapshot.committedCountsSoFar.L1} · L2{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.L2} · L3{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.L3} · DROP{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.DROP}
                    </Text>
                  )}
                  {!!state.liveStatusSnapshot?.syncProgress && (
                    <Text>同步进度：{state.liveStatusSnapshot.syncProgress}</Text>
                  )}
                  {!!state.liveStatusSnapshot?.lastMessage && (
                    <Text type="secondary">{state.liveStatusSnapshot.lastMessage}</Text>
                  )}
                </Flex>
              </div>
            </>
          )}

          {!!state.globalSummary && state.status !== "queued" && state.status !== "running" && (
            <div>
              <Text strong>总结摘要</Text>
              <Paragraph style={{ marginBottom: 0, marginTop: 6 }}>{state.globalSummary}</Paragraph>
            </div>
          )}

          {state.status !== "queued" && state.status !== "running" && (
            <ExperienceSyncStatusSection syncDetails={state.syncDetails} />
          )}

          {state.status !== "queued" && state.status !== "running" && (
            <CommittedMemoriesSection committedMemories={state.committedMemories} />
          )}

          {state.status !== "queued" && state.status !== "running" && (
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
          )}

          {state.status !== "queued" && state.status !== "running" && (
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
          )}

          {state.status !== "queued" && state.status !== "running" && (
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
          )}

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
