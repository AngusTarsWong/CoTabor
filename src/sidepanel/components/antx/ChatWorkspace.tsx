import React, { RefObject, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bubble, Sender } from '@ant-design/x';
import { Avatar, Button, Flex, Tag, Tooltip, Typography, Modal, Space } from 'antd';
import { StopOutlined, UserOutlined, BulbOutlined, LinkOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CotaborWelcome } from './CotaborWelcome';
import { LogMessage, RuntimeStats, TextLogMessage } from '../../hooks/useAppLogs';
import { StepLog } from '../StepCard';
import { ProcessPanel } from './ProcessPanel';
import { HumanRequest } from '../../../lib/claw';
import { WorkflowNodeRecord } from './workflow';
import { IntegrationStatus } from '../../../shared/storage/integration-status';
import { ExperienceStatusDrawer } from './ExperienceStatusDrawer';
import { ExperienceUiState } from '../../types/experience-ui';
import type { SidepanelLaunchMode } from '../../types/launch-mode';
import { buildDagExamplePayload } from '../../utils/dag-example';
import { LaunchModeBar } from './LaunchModeBar';
import type { SandboxRuntimeSnapshot } from '../../../core/orchestrator/types/ResourceRuntime';
import type { ReplayableDagNode } from '../../../core/orchestrator/replay/TaskRunReplay';
import type { ReplayableDagBranchTarget } from '../../../core/orchestrator/replay/DagPartialReplay';
import { DagReplayPanel } from './DagReplayPanel';

const { Text } = Typography;

interface ChatWorkspaceProps {
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  hasHumanRequest: boolean;
  humanRequest: HumanRequest | null;
  agentGoal: string;
  setAgentGoal: (goal: string) => void;
  launchMode: SidepanelLaunchMode;
  setLaunchMode: (mode: SidepanelLaunchMode) => void;
  experienceUiState: ExperienceUiState | null;
  resourceRuntime: SandboxRuntimeSnapshot | null;
  dagReplayTargets: ReplayableDagNode[];
  dagBranchReplayTargets: ReplayableDagBranchTarget[];
  replayLoadingKey: string | null;
  logsEndRef: RefObject<HTMLDivElement>;
  runtimeStats: RuntimeStats | null;
  handleStartAgent: (goalOverride?: string) => void;
  handleStopAgent: () => void;
  handleReplayDagNode: (taskRunId: string) => void;
  handleReplayDagBranch: (failedNodeId: string) => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
  isClassifyingIntent: boolean;
  pendingAutoLaunchRequest: { goal: string } | null;
  handleConfirmAutoLaunch: (useDag: boolean) => void;
  handleCancelAutoLaunch: () => void;
}

const renderSystemBubble = (message: TextLogMessage) => {
  if (message.displayStyle === 'inline-status') {
    return (
      <div style={{ color: message.isError ? '#b45309' : '#6b7280', fontSize: 13, textAlign: 'center', margin: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {message.isSuccess ? <BulbOutlined style={{ color: '#10b981' }} /> : <ClockCircleOutlined style={{ color: '#9ca3af' }} />}
        {message.text}
      </div>
    );
  }

  const background = message.isError ? '#fef2f2' : message.isSuccess ? '#ecfdf5' : '#f3f4f6';
  const color = message.isError ? '#b91c1c' : message.isSuccess ? '#047857' : '#4b5563';
  const border = message.isError ? '#fecaca' : message.isSuccess ? '#a7f3d0' : '#e5e7eb';

  return (
    <div
      style={{
        background,
        color,
        border: `1px solid ${border}`,
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {message.text}
    </div>
  );
};

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  logs,
  workflowNodes,
  isAgentRunning,
  isAgentStopping,
  hasHumanRequest,
  humanRequest,
  agentGoal,
  setAgentGoal,
  launchMode,
  setLaunchMode,
  experienceUiState,
  resourceRuntime,
  dagReplayTargets,
  dagBranchReplayTargets,
  replayLoadingKey,
  logsEndRef,
  runtimeStats,
  handleStartAgent,
  handleStopAgent,
  handleReplayDagNode,
  handleReplayDagBranch,
  integrationStatus,
  openOptions,
  currentTabTitle,
  isClassifyingIntent,
  pendingAutoLaunchRequest,
  handleConfirmAutoLaunch,
  handleCancelAutoLaunch,
}) => {
  const [experienceDrawerOpen, setExperienceDrawerOpen] = useState(false);
  const { t } = useTranslation('sidepanel');
  const hiddenWorkflowNodes = new Set(['memory_commit', 'experience_job']);

  const currentTabLabel = currentTabTitle?.trim() || t('agent.tabLabel');

  const bubbleItems = useMemo(() => {
    const items: Array<any> = [];
    const orderedWorkflowNodes = workflowNodes
      .filter((node) => !hiddenWorkflowNodes.has(node.nodeName))
      .sort((a, b) => a.order - b.order);
    const consumedNodeIds = new Set<string>();
    let currentRound = { nodes: [] as WorkflowNodeRecord[], taskRunId: undefined as string | undefined };

    const appendPendingNodesBefore = (orderLimit?: number) => {
      const pending = orderedWorkflowNodes.filter((node) => {
        if (consumedNodeIds.has(node.id)) return false;
        if (typeof orderLimit === 'number') return node.order < orderLimit;
        return true;
      });

      pending.forEach((node) => {
        consumedNodeIds.add(node.id);
        currentRound.nodes.push(node);
      });
    };

    const flushRound = (isLast = false) => {
      if (currentRound.nodes.length > 0 || (isLast && (humanRequest || isAgentStopping))) {
        // If this is not the absolute last round, it's definitely not active anymore (completed round in multi-turn)
        const isLastActive = isLast && (isAgentRunning || isAgentStopping || !!humanRequest);
        items.push({
          key: `process-${items.length}`,
          role: 'process',
          content: (
            <ProcessPanel
              workflowNodes={currentRound.nodes}
              runtimeStats={isLastActive ? runtimeStats : null}
              isAgentRunning={isLastActive ? isAgentRunning : false}
              isAgentStopping={isLastActive ? isAgentStopping : false}
              humanRequest={isLastActive ? humanRequest : null}
              resourceRuntime={isLastActive ? resourceRuntime : null}
            />
          ),
          variant: 'borderless',
          shape: 'round',
        });
      }
      currentRound = { nodes: [], taskRunId: undefined };
    };

    logs.forEach((log, index) => {
      if (log.sender === 'step') {
        const stepLog = log as StepLog;
        const node = orderedWorkflowNodes.find(n => n.stepId === stepLog.stepId);
        if (node) {
          appendPendingNodesBefore(node.order);
        }

        if (stepLog.node === 'memory_commit' || stepLog.node === 'experience_job') {
          return;
        }
        
        // Normal nodes
        if (node) {
          const nodeTaskRunId = node.taskRunId;
          // Only start a new round when the taskRunId changes (new user-triggered task).
          // Internal replans share the same taskRunId and stay in the same round.
          if (
            (stepLog.node === 'planner' || stepLog.node === 'replanner') &&
            currentRound.nodes.length > 0 &&
            nodeTaskRunId &&
            currentRound.taskRunId &&
            nodeTaskRunId !== currentRound.taskRunId
          ) {
            flushRound();
          }
          if (!currentRound.taskRunId && nodeTaskRunId) {
            currentRound.taskRunId = nodeTaskRunId;
          }
        } else if ((stepLog.node === 'planner' || stepLog.node === 'replanner') && currentRound.nodes.length > 0 && !orderedWorkflowNodes.find(n => n.stepId === stepLog.stepId)) {
          // Node not yet in workflowNodes (taskRunId unknown) — fall back to old heuristic
          const hasStartedRealRound =
            currentRound.nodes.some((roundNode) => roundNode.nodeName !== 'memory');
          if (hasStartedRealRound) {
            flushRound();
          }
        }
        if (node) {
          consumedNodeIds.add(node.id);
          currentRound.nodes.push(node);
        }
      } else {
        const textLog = log as TextLogMessage;
        if (textLog.sender === 'system' || textLog.sender === 'agent' || textLog.sender === 'user') {
           flushRound(!isAgentRunning);
        }

        if (textLog.sender === 'system') {
          items.push({
            key: `system-${index}-${textLog.text}`,
            role: 'system',
            content: renderSystemBubble(textLog),
            variant: 'borderless',
            shape: 'round',
          });
        } else {
          items.push({
            key: `${textLog.sender}-${index}-${textLog.text}`,
            role: textLog.sender === 'user' ? 'user' : 'ai',
            content: textLog.text,
          });
        }
      }
    });

    appendPendingNodesBefore();
    flushRound(true); // Final flush for anything remaining (isLast = true)

    if (isAgentRunning && !hasHumanRequest && workflowNodes.length === 0) {
      items.push({
        key: 'agent-loading',
        role: 'ai',
        content: isAgentStopping ? t('agent.stopping') : t('agent.loading'),
        loading: true,
      });
    }

    return items;
  }, [logs, workflowNodes, hasHumanRequest, humanRequest, isAgentRunning, isAgentStopping, runtimeStats]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #fbfdff 0%, #f7f9fc 100%)' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bubbleItems.length === 0 ? (
          <CotaborWelcome 
            setAgentGoal={setAgentGoal} 
            integrationStatus={integrationStatus}
            openOptions={openOptions}
            currentTabTitle={currentTabTitle}
          />
        ) : (
          <Bubble.List
            autoScroll
            items={bubbleItems}
            role={{
              ai: {
                placement: 'start',
                avatar: <Avatar size={32} src={chrome.runtime.getURL('icons/icon48.png')} style={{ backgroundColor: 'transparent' }} />,
                variant: 'shadow',
                shape: 'corner',
                typing: { effect: 'fade-in', interval: 20 },
                messageRender: (content) => (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{children}</p>,
                      h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 6px' }}>{children}</h1>,
                      h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 5px' }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 4px' }}>{children}</h3>,
                      ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '4px 0 8px' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '4px 0 8px' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 3, lineHeight: 1.6 }}>{children}</li>,
                      code: ({ children }) => <code style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'monospace' }}>{children}</code>,
                      pre: ({ children }) => <pre style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 12px', overflowX: 'auto', fontSize: 12, margin: '6px 0' }}>{children}</pre>,
                      strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #dbeafe', paddingLeft: 10, margin: '6px 0', color: '#64748b' }}>{children}</blockquote>,
                    }}
                  >
                    {String(content)}
                  </ReactMarkdown>
                ),
                styles: {
                  content: {
                    background: '#ffffff',
                    color: '#111827',
                    borderRadius: 18,
                    border: '1px solid #eef2f7',
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
                  },
                },
              },
              user: {
                placement: 'end',
                avatar: <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#2563eb' }} />,
                variant: 'filled',
                shape: 'corner',
                styles: {
                  content: {
                    background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                    color: '#ffffff',
                    borderRadius: 18,
                    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.24)',
                  },
                },
              },
              system: {
                placement: 'start',
                variant: 'borderless',
                shape: 'round',
                avatar: null,
                styles: {
                  content: {
                    background: 'transparent',
                    padding: 0,
                    boxShadow: 'none',
                  },
                  body: {
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                  },
                },
              },
              process: {
                placement: 'start',
                variant: 'borderless',
                avatar: null,
                styles: {
                  content: {
                    background: 'transparent',
                    padding: 0,
                    boxShadow: 'none',
                  },
                  body: {
                    width: '100%',
                  },
                },
              },
            }}
          />
        )}
        {experienceUiState?.visible && (
          <ExperienceStatusDrawer
            state={experienceUiState}
            open={experienceDrawerOpen}
            onOpen={() => setExperienceDrawerOpen(true)}
            onClose={() => setExperienceDrawerOpen(false)}
          />
        )}
        {!isAgentRunning && !isAgentStopping && !humanRequest && (dagReplayTargets.length > 0 || dagBranchReplayTargets.length > 0) ? (
          <DagReplayPanel
            nodes={dagReplayTargets}
            branches={dagBranchReplayTargets}
            loadingKey={replayLoadingKey}
            onReplay={handleReplayDagNode}
            onReplayBranch={handleReplayDagBranch}
          />
        ) : null}
        <div ref={logsEndRef} />
      </div>

      <Modal
        title={
          <Space>
            <span style={{ fontSize: '18px' }}>🐝</span>
            发现复杂任务，是否召唤蜂群？
          </Space>
        }
        open={!!pendingAutoLaunchRequest}
        onCancel={handleCancelAutoLaunch}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={360}
      >
        <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 20 }}>
          这看起来是一个需要跨越多个页面的大工程。是否授权开启<b>蜂群模式</b>？<br/><br/>
          系统将自动分化出多个 AI 助手为您分工并行处理，大幅提升效率。
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Button
            block
            type="primary"
            size="large"
            onClick={() => handleConfirmAutoLaunch(true)}
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)', border: 'none' }}
          >
            出动蜂群 (推荐)
          </Button>
          <Button
            block
            size="large"
            onClick={() => handleConfirmAutoLaunch(false)}
          >
            仅在当前页面尝试单兵作战
          </Button>
          <Button
            block
            type="text"
            onClick={handleCancelAutoLaunch}
          >
            取消任务
          </Button>
        </Space>
      </Modal>

      <div style={{ padding: '10px 16px 18px', borderTop: '1px solid #e5e7eb', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <Sender
          value={agentGoal}
          onChange={(value) => setAgentGoal(value)}
          onSubmit={(value) => handleStartAgent(value)}
          placeholder={
            isAgentStopping
              ? t('input.placeholderStopping')
              : isAgentRunning
                ? t('input.placeholderRunning')
                : launchMode === 'dag'
                  ? '请输入任务目标，系统会自动规划 DAG'
                  : t('input.placeholder')
          }
          submitType="enter"
          loading={isAgentRunning || isClassifyingIntent}
          disabled={isAgentStopping || isClassifyingIntent}
          autoSize={{ minRows: 1, maxRows: 5 }}
          styles={{
            root: {
              borderRadius: 20,
              background: '#ffffff',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
              border: '1px solid #e5e7eb',
            },
          }}
          prefix={
            !isAgentRunning && !isAgentStopping ? (
              <LaunchModeBar
                mode={launchMode}
                onModeChange={setLaunchMode}
                onInsertDagExample={() => setAgentGoal(buildDagExamplePayload())}
                disabled={isClassifyingIntent}
              />
            ) : undefined
          }
          header={
            isAgentRunning || isAgentStopping ? (
              <Flex justify="space-between" align="center" style={{ padding: '8px 8px 0' }}>
                <Tag color={isAgentStopping ? 'gold' : 'processing'} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                  {isAgentStopping ? t('common:status.stopping') : t('input.taskRunning')}
                </Tag>
                <Button
                  danger={!isAgentStopping}
                  type={isAgentStopping ? 'default' : 'primary'}
                  icon={<StopOutlined />}
                  onClick={handleStopAgent}
                  disabled={isAgentStopping}
                  style={{ borderRadius: 999 }}
                >
                  {isAgentStopping ? t('input.stoppingBtn') : t('input.forceStop')}
                </Button>
              </Flex>
            ) : undefined
          }
        />
      </div>
    </div>
  );
};
