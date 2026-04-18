import React, { RefObject, useMemo } from 'react';
import { Bubble, Sender } from '@ant-design/x';
import { Avatar, Button, Flex, Tag } from 'antd';
import { RobotOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { CotaborWelcome } from './CotaborWelcome';
import { LogMessage, RuntimeStats, TextLogMessage } from '../../hooks/useAppLogs';
import { StepLog } from '../StepCard';
import { ProcessPanel } from './ProcessPanel';
import { HumanRequest } from '../../../lib/claw';
import { WorkflowNodeRecord } from './workflow';

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
  logsEndRef: RefObject<HTMLDivElement>;
  runtimeStats: RuntimeStats | null;
  handleStartAgent: (goalOverride?: string) => void;
  handleStopAgent: () => void;
}

const renderSystemBubble = (message: TextLogMessage) => {
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
  logsEndRef,
  runtimeStats,
  handleStartAgent,
  handleStopAgent,
}) => {
  const bubbleItems = useMemo(() => {
    const items: Array<any> = [];
    
    let currentRound = { planBubbles: [] as TextLogMessage[], nodes: [] as WorkflowNodeRecord[] };

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
        if ((stepLog.node === 'planner' || stepLog.node === 'replanner') && currentRound.nodes.length > 0) {
          flushRound(); // not the last round, just a normal flush between turns
        }
        const node = workflowNodes.find(n => n.stepId === stepLog.stepId);
        if (node) {
          currentRound.nodes.push(node);
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

    flushRound(true); // Final flush for anything remaining (isLast = true)

    if (isAgentRunning && !hasHumanRequest && workflowNodes.length === 0) {
      items.push({
        key: 'agent-loading',
        role: 'ai',
        content: isAgentStopping ? '正在停止当前任务，等待当前步骤完成...' : '正在分析页面并执行任务...',
        loading: true,
      });
    }

    return items;
  }, [logs, workflowNodes, showDebugLogs, hasHumanRequest, humanRequest, isAgentRunning, isAgentStopping, runtimeStats]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #fbfdff 0%, #f7f9fc 100%)' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bubbleItems.length === 0 ? (
          <CotaborWelcome setAgentGoal={setAgentGoal} handleStartAgent={handleStartAgent} />
        ) : (
          <Bubble.List
            autoScroll
            items={bubbleItems}
            role={{
              ai: {
                placement: 'start',
                avatar: <Avatar size={32} icon={<RobotOutlined />} style={{ backgroundColor: '#111827' }} />,
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
        <div ref={logsEndRef} />
      </div>

      <div style={{ padding: '14px 16px 18px', borderTop: '1px solid #e5e7eb', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <Sender
          value={agentGoal}
          onChange={(value) => setAgentGoal(value)}
          onSubmit={(value) => handleStartAgent(value)}
          placeholder={isAgentStopping ? 'Agent 停止中...' : isAgentRunning ? 'Agent 执行中...' : '告诉 CoTabor 你想做什么...'}
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
          header={isAgentRunning ? (
            <Flex justify="space-between" align="center" style={{ padding: '8px 8px 0' }}>
              <Tag color={isAgentStopping ? 'gold' : 'processing'} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                {isAgentStopping ? '停止中' : '任务执行中'}
              </Tag>
              <Button
                danger={!isAgentStopping}
                type={isAgentStopping ? 'default' : 'primary'}
                icon={<StopOutlined />}
                onClick={handleStopAgent}
                disabled={isAgentStopping}
                style={{ borderRadius: 999 }}
              >
                {isAgentStopping ? '停止中...' : '强制停止'}
              </Button>
            </Flex>
          ) : null}
        />
      </div>
    </div>
  );
};
