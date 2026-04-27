import React, { RefObject, useMemo, useState } from 'react';
import { Bubble, Sender } from '@ant-design/x';
import { Avatar, Button, Flex, Tag, Spin, Tooltip, Typography } from 'antd';
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

const { Text } = Typography;

interface ChatWorkspaceProps {
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  showDebugLogs: boolean;
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
  logsEndRef: RefObject<HTMLDivElement>;
  runtimeStats: RuntimeStats | null;
  handleStartAgent: (goalOverride?: string) => void;
  handleStopAgent: () => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
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
  showDebugLogs,
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
  logsEndRef,
  runtimeStats,
  handleStartAgent,
  handleStopAgent,
  integrationStatus,
  openOptions,
  currentTabTitle,
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
    let currentRound = { planBubbles: [] as TextLogMessage[], nodes: [] as WorkflowNodeRecord[] };

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
      currentRound.planBubbles.forEach((pb, i) => {
        items.push({
          key: `plan-${items.length}-${i}`,
          role: 'ai',
          content: pb.text,
        });
      });

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
      currentRound = { planBubbles: [], nodes: [] };
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
        
        if (stepLog.node === 'experience') {
          // If it's an experience node, flush any pending normal nodes first
          if (currentRound.nodes.length > 0) {
            flushRound();
          }
          if (node) {
            items.push({
                  key: `experience-${index}`,
              role: 'system',
              content: (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', margin: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {node.status === 'running' ? (
                    <><Spin size="small" /> {t('experience.summarizing')}</>
                  ) : (
                    <>
                      <BulbOutlined style={{ color: '#10b981' }} />
                      {t('experience.complete')}
                    </>
                  )}
                </div>
              ),
              variant: 'borderless',
            });
          }
        } else {
          // Normal nodes
          if ((stepLog.node === 'planner' || stepLog.node === 'replanner') && currentRound.nodes.length > 0) {
            const hasStartedRealRound =
              currentRound.planBubbles.length > 0 ||
              currentRound.nodes.some((roundNode) => roundNode.nodeName !== 'memory');
            if (hasStartedRealRound) {
              flushRound(); // not the last round, just a normal flush between turns
            }
          }
          if (node) {
            consumedNodeIds.add(node.id);
            currentRound.nodes.push(node);
          }
        }
      } else if (log.sender === 'agent' && (log as TextLogMessage).isPlan) {
        currentRound.planBubbles.push(log as TextLogMessage);
      } else {
        const textLog = log as TextLogMessage;
        if (textLog.sender === 'agent' && textLog.isDebug && !showDebugLogs) {
          return;
        }
        
        // When we encounter user/system/conclusion logs, we MUST flush any pending process panel first.
        // If the agent is currently NOT running, then this pending panel is the last one for the whole task,
        // so we pass `true` to ensure it receives the humanRequest/isAgentStopping context if any.
        // If it's a multi-turn conversation and we are just between turns, it's fine.
        if (textLog.sender === 'system' || (textLog.sender === 'agent' && !textLog.isPlan) || textLog.sender === 'user') {
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
  }, [logs, workflowNodes, showDebugLogs, hasHumanRequest, humanRequest, isAgentRunning, isAgentStopping, runtimeStats]);

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
        <div ref={logsEndRef} />
      </div>

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
                  ? '请输入 DAG JSON 任务图'
                  : t('input.placeholder')
          }
          submitType="enter"
          loading={isAgentRunning}
          disabled={isAgentStopping}
          autoSize={{ minRows: 1, maxRows: 5 }}
          styles={{
            root: {
              borderRadius: 20,
              background: '#ffffff',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
              border: '1px solid #e5e7eb',
            },
          }}
          header={
            isAgentRunning ? (
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
            ) : (
              <LaunchModeBar
                mode={launchMode}
                onModeChange={setLaunchMode}
                onInsertDagExample={() => setAgentGoal(buildDagExamplePayload())}
              />
            )
          }
        />
      </div>
    </div>
  );
};
