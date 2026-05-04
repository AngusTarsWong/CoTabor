import React from "react";
import { BulbOutlined, ClockCircleOutlined, DownOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Drawer, Flex, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
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

export const ExperienceStatusDrawer: React.FC<ExperienceStatusDrawerProps> = ({
  state,
  open,
  onOpen,
  onClose,
}) => {
  const { t } = useTranslation('sidepanel');

  if (!state?.visible) return null;

  const renderStatusText = (s: ExperienceUiState): string => {
    if (s.status === "queued" || s.status === "running") return t('experience.status.processing');
    if (s.status === "failed") return t('experience.status.failed', { error: s.error || t('experience.drawer.unknownError') });
    if (s.committed) {
      return t('experience.status.saved', { l1: s.committed.L1, l2: s.committed.L2, l3: s.committed.L3 });
    }
    return s.text;
  };

  const renderPhaseLabel = (s: ExperienceUiState): string => {
    const phase = s.liveStatusSnapshot?.phase;
    if (phase === "queued")      return t('experience.phase.queued');
    if (phase === "summarizing") return t('experience.phase.summarizing');
    if (phase === "classifying") return t('experience.phase.classifying');
    if (phase === "syncing")     return t('experience.phase.syncing');
    if (s.status === "completed") return t('experience.phase.completed');
    if (s.status === "failed")    return t('experience.phase.failed');
    return t('experience.phase.processing');
  };

  const showQueueNotice = state.status === "queued" || state.status === "running";
  const statusColor = state.status === "failed" ? "#b45309" : "#6b7280";

  return (
    <>
      <Card
        size="small"
        hoverable
        onClick={open ? onClose : onOpen}
        style={{
          width: "100%",
          margin: "8px 0 16px",
          background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
        bodyStyle={{ padding: "10px 14px" }}
      >
        <Flex vertical gap={8}>
          {showQueueNotice && (
            <Flex align="center" gap={6}>
              <BulbOutlined style={{ color: "#10b981", fontSize: 14 }} />
              <Text style={{ color: "#475569", fontSize: 12, fontWeight: 500 }}>{t('experience.queued')}</Text>
            </Flex>
          )}
          <Flex align="center" justify="space-between" gap={8}>
            <Flex align="center" gap={8}>
              {renderStatusIcon(state.status)}
              <Text style={{ color: statusColor, fontSize: 13, fontWeight: 500 }}>
                {renderStatusText(state)}
              </Text>
            </Flex>
            <DownOutlined 
              style={{ 
                color: "#94a3b8", 
                fontSize: 12, 
                transition: "transform 0.3s",
                transform: open ? "rotate(180deg)" : "rotate(0deg)"
              }} 
            />
          </Flex>
        </Flex>
      </Card>

      <Drawer
        title={t('experience.drawer.title')}
        placement="bottom"
        height={520}
        open={open}
        onClose={onClose}
        destroyOnClose={false}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <Text strong>{t('experience.drawer.processingStatus')}</Text>
            <Paragraph style={{ marginBottom: 0, marginTop: 6 }}>{renderStatusText(state)}</Paragraph>
          </div>

          {(state.status === "queued" || state.status === "running") && (
            <>
              <div>
                <Text strong>{t('experience.drawer.currentPhase')}</Text>
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
                  <Text>{t('experience.drawer.phaseDesc')}{state.liveStatusSnapshot?.currentStepTitle || t('experience.phase.queued')}</Text>
                  {!!state.liveStatusSnapshot?.currentModel && (
                    <Text>{t('experience.drawer.currentModel')}{state.liveStatusSnapshot.currentModel}</Text>
                  )}
                  {typeof state.liveStatusSnapshot?.candidateCountSoFar === "number" && (
                    <Text>{t('experience.drawer.candidateCount')}{state.liveStatusSnapshot.candidateCountSoFar}</Text>
                  )}
                  {!!state.liveStatusSnapshot?.committedCountsSoFar && (
                    <Text>
                      {t('experience.drawer.committedProgress')}L1 {state.liveStatusSnapshot.committedCountsSoFar.L1} · L2{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.L2} · L3{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.L3} · DROP{" "}
                      {state.liveStatusSnapshot.committedCountsSoFar.DROP}
                    </Text>
                  )}
                  {!!state.liveStatusSnapshot?.syncProgress && (
                    <Text>{t('experience.drawer.syncProgress')}{state.liveStatusSnapshot.syncProgress}</Text>
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
              <Text strong>{t('experience.drawer.summary')}</Text>
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
              <Text strong>{t('experience.drawer.candidateResult')}</Text>
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
                  <Text>{t('experience.drawer.candidateLabel')}{state.candidates ?? 0}</Text>
                  <Text>
                    {t('experience.drawer.submitResult')}
                    {state.committed
                      ? ` L1 ${state.committed.L1} · L2 ${state.committed.L2} · L3 ${state.committed.L3} · DROP ${state.committed.DROP}`
                      : t('experience.drawer.noResult')}
                  </Text>
                </Flex>
              </div>
            </div>
          )}

          {state.status !== "queued" && state.status !== "running" && (
            <div>
              <Text strong>{t('experience.drawer.refinedCandidates')}</Text>
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
                {state.experienceBuffer ? JSON.stringify(state.experienceBuffer, null, 2) : t('experience.drawer.noCandidates')}
              </pre>
            </div>
          )}

          {state.status !== "queued" && state.status !== "running" && (
            <div>
              <Text strong>{t('experience.drawer.rawOutput')}</Text>
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
                {state.rawResponse || t('experience.drawer.noOutput')}
              </pre>
            </div>
          )}

          {state.status === "failed" && (
            <div>
              <Text strong>{t('experience.drawer.failedReason')}</Text>
              <Paragraph type="danger" style={{ marginBottom: 0, marginTop: 6 }}>
                {state.error || t('experience.drawer.unknownError')}
              </Paragraph>
            </div>
          )}
        </Space>
      </Drawer>
    </>
  );
};
