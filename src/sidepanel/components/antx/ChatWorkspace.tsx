import React, { RefObject, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bubble, Sender } from '@ant-design/x';
import { Avatar, Button, Flex, Tag, Tooltip, Typography, Modal, Space, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { StopOutlined, UserOutlined, BulbOutlined, LinkOutlined, ClockCircleOutlined, ArrowUpOutlined, PartitionOutlined, DownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CotaborWelcome } from './CotaborWelcome';
import { LogMessage, RuntimeStats, TextLogMessage } from '../../hooks/useAppLogs';
import { StepLog } from '../StepCard';
import { ProcessPanel } from './ProcessPanel';
import { HumanRequest } from '../../../lib/claw';
import { WorkflowNodeRecord, WorkflowTreeNode } from './workflow';
import { IntegrationStatus } from '../../../shared/storage/integration-status';
import { ExperienceStatusDrawer } from './ExperienceStatusDrawer';
import { ExperienceUiState } from '../../types/experience-ui';
import type { SandboxRuntimeSnapshot } from '../../../core/orchestrator/types/ResourceRuntime';
import { SwarmMasterCard } from './SwarmMasterCard';

const { Text } = Typography;

type AgentMode = 'smart' | 'swarm' | 'single';

type StartAgentOptions = {
  skipIntentClassification?: boolean;
  forceDagPlanning?: boolean;
};

const renderMarkdownBubbleContent = (content: React.ReactNode) => (
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
);

interface ChatWorkspaceProps {
  logs: LogMessage[];
  workflowNodes: WorkflowNodeRecord[];
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  hasHumanRequest: boolean;
  humanRequest: HumanRequest | null;
  agentGoal: string;
  setAgentGoal: (goal: string) => void;
  experienceUiState: ExperienceUiState | null;
  resourceRuntime: SandboxRuntimeSnapshot | null;
  rootTaskRunId: string | null;
  logsEndRef: RefObject<HTMLDivElement>;
  runtimeStats: RuntimeStats | null;
  handleStartAgent: (goalOverride?: string, options?: StartAgentOptions) => void;
  handleStopAgent: () => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
  isClassifyingIntent: boolean;
  pendingAutoLaunchRequest: { goal: string } | null;
  setPendingAutoLaunchRequest: (req: { goal: string } | null) => void;
  handleConfirmAutoLaunch: (useDag: boolean) => void;
  handleCancelAutoLaunch: () => void;
  handleCloseSwarmTabGroup: () => Promise<void>;
  handleOpenSwarm: (options?: { active?: boolean }) => void;
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
  experienceUiState,
  resourceRuntime,
  rootTaskRunId,
  logsEndRef,
  runtimeStats,
  handleStartAgent,
  handleStopAgent,
  integrationStatus,
  openOptions,
  currentTabTitle,
  isClassifyingIntent,
  pendingAutoLaunchRequest,
  setPendingAutoLaunchRequest,
  handleConfirmAutoLaunch,
  handleCancelAutoLaunch,
  handleCloseSwarmTabGroup,
  handleOpenSwarm: handleOpenSwarmFromProps,
}) => {
  const [experienceDrawerOpen, setExperienceDrawerOpen] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('single');
  const { t } = useTranslation('sidepanel');
  const hiddenWorkflowNodes = new Set(['memory_commit', 'experience_job']);

  const currentTabLabel = currentTabTitle?.trim() || t('agent.tabLabel');

  const modeOptions = useMemo(() => [
    { key: 'smart', label: t('input.modeSmart'), icon: <BulbOutlined /> },
    { key: 'swarm', label: t('input.modeSwarm'), icon: <PartitionOutlined /> },
    { key: 'single', label: t('input.modeSingle'), icon: <UserOutlined /> },
  ], [t]);

  const currentModeOption = modeOptions.find(opt => opt.key === agentMode) || modeOptions[0];

  const handleModeChange: MenuProps['onClick'] = ({ key }) => {
    setAgentMode(key as AgentMode);
  };

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;

    const options = {
      smart: {},
      swarm: { skipIntentClassification: true, forceDagPlanning: true },
      single: { skipIntentClassification: true, forceDagPlanning: false },
    }[agentMode];

    handleStartAgent(value, options);
  };

  const menu: MenuProps = {
    items: modeOptions.map(opt => ({
      ...opt,
      onClick: handleModeChange,
    })),
    selectable: true,
    selectedKeys: [agentMode],
  };

  const handleOpenSwarm = () => {
    const isSwarmActive = resourceRuntime?.agents && resourceRuntime.agents.length > 0;
    
    // If a swarm is currently running, just jump to the cockpit directly
    if (isSwarmActive) {
      handleOpenSwarmFromProps({ active: true });
      return;
    }

    // If there's input and no swarm is active, show the confirmation modal to explain the transition.
    if (agentGoal.trim()) {
      // Trigger the same flow as auto-launch to show the modal
      setPendingAutoLaunchRequest({ goal: agentGoal.trim() });
    } else {
      handleOpenSwarmFromProps({ active: true });
    }
  };

  const bubbleItems = useMemo(() => {
    const items: Array<any> = [];
    const orderedWorkflowNodes = workflowNodes
      .filter((node) => !hiddenWorkflowNodes.has(node.nodeName))
      .sort((a, b) => a.order - b.order);

    // Filter out detailed sub-agent nodes if we have a swarm running
    const hasSwarm = resourceRuntime && resourceRuntime.agents && resourceRuntime.agents.length > 0;

    // Extract taskRunIds of sub-agents
    const subAgentTaskRunIds = new Set<string>();
    if (hasSwarm) {
      resourceRuntime!.agents!.forEach(agent => {
        if (agent.taskRunId) {
          subAgentTaskRunIds.add(agent.taskRunId);
        }
        if (agent.originalTaskRunId) {
          subAgentTaskRunIds.add(agent.originalTaskRunId);
        }
        if (agent.nodeId) {
          subAgentTaskRunIds.add(agent.nodeId);
        }
      });
    }

    const isSubAgentTaskRunId = (taskRunId?: string) =>
      !!taskRunId && subAgentTaskRunIds.has(taskRunId);

    const isMasterTaskRunId = (taskRunId?: string) => {
      if (!taskRunId) return true;
      if (rootTaskRunId) return taskRunId === rootTaskRunId;
      return !isSubAgentTaskRunId(taskRunId);
    };

    const filteredOrderedWorkflowNodes = orderedWorkflowNodes.filter(node => {
      if (hasSwarm && !isMasterTaskRunId(node.taskRunId)) {
        return false;
      }
      return true;
    });

    const consumedNodeIds = new Set<string>();
    let currentRound = { nodes: [] as WorkflowNodeRecord[], taskRunId: undefined as string | undefined };

    const appendPendingNodesBefore = (orderLimit?: number) => {
      const pending = filteredOrderedWorkflowNodes.filter((node) => {
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
              resourceRuntime={isLastActive && !hasSwarm ? resourceRuntime : null} // Don't pass resourceRuntime here if swarm is active, we render MasterCard instead
              agentGoal={agentGoal}
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
        if (hasSwarm && !isMasterTaskRunId(stepLog.taskRunId)) {
          return;
        }
        const node = filteredOrderedWorkflowNodes.find(n => n.stepId === stepLog.stepId);
        if (node) {
          appendPendingNodesBefore(node.order);
        }

        if (stepLog.node === 'memory_commit' || stepLog.node === 'experience_job') {
          return;
        }

        if (!node && hasSwarm && stepLog.taskRunId && !isMasterTaskRunId(stepLog.taskRunId)) {
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
        } else if ((stepLog.node === 'planner' || stepLog.node === 'replanner') && currentRound.nodes.length > 0 && !filteredOrderedWorkflowNodes.find(n => n.stepId === stepLog.stepId)) {
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
        const shouldSplitForTextLog = textLog.sender === 'user' || !isAgentRunning;
        if (shouldSplitForTextLog) {
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

    // Inject SwarmMasterCard if we have a running swarm
    if (hasSwarm) {
       items.push({
          key: 'swarm-master-card',
          role: 'process',
          content: (
            <SwarmMasterCard
              agents={resourceRuntime.agents!}
              workflowNodes={workflowNodes}
              sandboxGroupId={resourceRuntime.groupId}
              onOpenCockpit={handleOpenSwarm}
              onCloseTabGroup={handleCloseSwarmTabGroup}
            />
          ),
       });
    }

    if (isAgentRunning && !hasHumanRequest && filteredOrderedWorkflowNodes.length === 0 && !hasSwarm) {
      items.push({
        key: 'agent-loading',
        role: 'ai',
        content: isAgentStopping ? t('agent.stopping') : t('agent.loading'),
        loading: true,
      });
    }

    return items;
  }, [logs, workflowNodes, hasHumanRequest, humanRequest, isAgentRunning, isAgentStopping, runtimeStats, resourceRuntime, rootTaskRunId, handleCloseSwarmTabGroup]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #fbfdff 0%, #f7f9fc 100%)' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bubbleItems.length === 0 ? (
          <CotaborWelcome
            setAgentGoal={setAgentGoal}
            integrationStatus={integrationStatus}
            openOptions={openOptions}
            currentTabTitle={currentTabTitle}
            agentMode={agentMode}
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
                contentRender: renderMarkdownBubbleContent,
                styles: {
                  content: {
                    background: '#f0f7ff',
                    color: '#111827',
                    borderRadius: 18,
                    border: '1px solid #dbeafe',
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

      <Modal
        title={
          <Space>
            <span style={{ fontSize: '18px' }}>🐝</span>
            {t('swarm.autoLaunch.title')}
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
          <span dangerouslySetInnerHTML={{ __html: t('swarm.autoLaunch.description') }} />
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Button
            block
            type="primary"
            size="large"
            onClick={() => handleConfirmAutoLaunch(true)}
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)', border: 'none' }}
          >
            {t('swarm.autoLaunch.confirm')}
          </Button>
          <Button
            block
            size="large"
            onClick={() => handleConfirmAutoLaunch(false)}
          >
            {t('swarm.autoLaunch.single')}
          </Button>
          <Button
            block
            type="text"
            onClick={handleCancelAutoLaunch}
          >
            {t('swarm.autoLaunch.cancel')}
          </Button>
        </Space>
      </Modal>

      <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)' }}>
        <Sender
          value={agentGoal}
          onChange={(value) => setAgentGoal(value)}
          onSubmit={handleSubmit}
          placeholder={
            isAgentStopping
              ? t('input.placeholderStopping')
              : isAgentRunning
                ? t('input.placeholderRunning')
                : t('input.agentPlaceholder')
          }
          submitType="enter"
          suffix={false}
          loading={isAgentRunning || isClassifyingIntent}
          disabled={isAgentStopping || isClassifyingIntent}
          autoSize={{ minRows: 2, maxRows: 6 }}
          styles={{
            root: {
              borderRadius: 24,
              background: '#ffffff',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              border: '1px solid #e2e8f0',
              padding: '4px',
            },
            input: {
              padding: '12px 16px 4px',
              fontSize: '14px',
            }
          }}
          footer={(_, { components: { SendButton } }) => (
            <Flex justify="space-between" align="center" style={{ width: '100%', padding: '0 8px 4px' }}>
              <Dropdown menu={menu} disabled={isAgentRunning || isAgentStopping || isClassifyingIntent}>
                <Button
                  type="text"
                  size="small"
                  style={{
                    color: '#475569',
                    fontSize: 13,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: 16, color: '#2563eb' }}>
                    {currentModeOption.icon}
                  </span>
                  <span style={{ fontWeight: 500 }}>{currentModeOption.label}</span>
                  <DownOutlined style={{ fontSize: 10, opacity: 0.5 }} />
                </Button>
              </Dropdown>

              <Flex gap={8} align="center">
                {(agentMode === 'swarm' || (resourceRuntime?.agents && resourceRuntime.agents.length > 0)) && (
                  <Button
                    type="text"
                    icon={<PartitionOutlined />}
                    onClick={handleOpenSwarm}
                    disabled={isClassifyingIntent}
                    style={{ color: '#475569', fontSize: 13, padding: '4px 10px' }}
                  >
                    {t('input.swarmCockpit')}
                  </Button>
                )}

                {isAgentRunning || isAgentStopping ? (
                  <Button
                    danger={!isAgentStopping}
                    type={isAgentStopping ? 'default' : 'primary'}
                    icon={<StopOutlined />}
                    onClick={handleStopAgent}
                    disabled={isAgentStopping}
                    style={{ borderRadius: 999, height: 32 }}
                  >
                    {isAgentStopping ? t('input.stoppingBtn') : t('input.forceStop')}
                  </Button>
                ) : (
                  <SendButton
                    type="primary"
                    shape="circle"
                    style={{
                      background: agentGoal.trim() ? 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)' : undefined,
                      border: 'none',
                      boxShadow: agentGoal.trim() ? '0 4px 12px rgba(37, 99, 235, 0.2)' : undefined
                    }}
                  />
                )}
              </Flex>
            </Flex>
          )}
        />
      </div>
    </div>
  );
};
