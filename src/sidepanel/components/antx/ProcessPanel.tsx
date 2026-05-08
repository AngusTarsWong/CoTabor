import React, { useMemo } from "react";
import { Card, Flex, Space, Tag, Typography, Alert, Progress, Button } from "antd";
import { WarningFilled, ArrowRightOutlined } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { RuntimeStats } from "../../hooks/useAppLogs";
import { HumanRequest } from "../../../lib/claw";
import type { SandboxRuntimeSnapshot } from "../../../core/orchestrator/types/ResourceRuntime";
import {
  WorkflowNodeRecord,
  WorkflowTreeNode,
  buildWorkflowNodeFromHumanRequest,
  buildWorkflowTree,
} from "./workflow";
import { ResourceRuntimePanel } from "./ResourceRuntimePanel";
import { AgentMonitor } from "../../../shared/components/AgentMonitor";
import { UnifiedAgentState, AgentStatus } from "../../../shared/types/agent-view-model";

const { Text } = Typography;

interface ProcessPanelProps {
  workflowNodes: WorkflowNodeRecord[];
  runtimeStats: RuntimeStats | null;
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  humanRequest: HumanRequest | null;
  resourceRuntime: SandboxRuntimeSnapshot | null;
  agentGoal: string;
}

function jumpToCockpit(cockpitTabId: number) {
  chrome.tabs.update(cockpitTabId, { active: true }).catch(() => {});
}

export const ProcessPanel: React.FC<ProcessPanelProps> = ({
  workflowNodes,
  runtimeStats,
  isAgentRunning,
  isAgentStopping,
  humanRequest,
  resourceRuntime,
  agentGoal,
}) => {
  const { t } = useTranslation(['sidepanel', 'common']);

  const nodes = useMemo<WorkflowTreeNode[]>(() => {
    const items = [...workflowNodes];
    if (humanRequest) {
      items.push(buildWorkflowNodeFromHumanRequest(humanRequest, workflowNodes.length + 1));
    }
    return buildWorkflowTree(items);
  }, [humanRequest, workflowNodes]);

  const swarmAgents = resourceRuntime?.agents ?? [];
  const isSwarmMode = swarmAgents.length > 0;
  const cockpitTabId = resourceRuntime?.cockpitTabId;

  const completedCount = swarmAgents.filter(a => a.status === "success").length;
  const totalCount = swarmAgents.length;
  const interventionAgents = swarmAgents.filter(a => a.humanRequest != null);
  const hasIntervention = interventionAgents.length > 0;

  const agentState = useMemo<UnifiedAgentState>(() => {
    let status: AgentStatus = 'success';
    if (humanRequest) status = 'waiting';
    else if (isAgentStopping) status = 'stopping';
    else if (isAgentRunning) status = 'running';

    const lastNode = workflowNodes[workflowNodes.length - 1];
    const firstNode = workflowNodes[0];

    return {
      id: lastNode?.taskRunId || 'master',
      title: agentGoal || t('sidepanel:process.title'),
      status,
      startedAt: firstNode?.startedAt || firstNode?.updatedAt || Date.now(),
      updatedAt: lastNode?.updatedAt || Date.now(),
      currentStep: lastNode?.summary,
      currentUrl: lastNode?.rawUpdate?.meta_data?.url,
      tabId: lastNode?.rawUpdate?.meta_data?.tabId,
      replanCount: lastNode?.rawUpdate?.replan_count || 0,
      retryCount: lastNode?.rawUpdate?.cortex_retry_count || 0,
      humanRequest: humanRequest ? {
        type: (humanRequest as any).type || 'stuck',
        message: humanRequest.message,
        actionDescription: humanRequest.action_description,
      } : null,
      summarySoFar: lastNode?.rawUpdate?.planner_output?.action?.result || lastNode?.rawUpdate?.planner_output?.action?.summary,
      error: lastNode?.rawUpdate?.error,
    };
  }, [workflowNodes, humanRequest, isAgentRunning, isAgentStopping, agentGoal, t]);

  if (nodes.length === 0) return null;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {/* 1. Statistics Header (Sidepanel exclusive) */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
        <Text strong style={{ fontSize: 16, color: "#111827" }}>
          {t('sidepanel:process.title')}
        </Text>
        {runtimeStats && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('sidepanel:process.stepCounter', { num: runtimeStats.stepNo, tokens: runtimeStats.totalTokens })}
          </Text>
        )}
      </Flex>

      {/* 2. Resource Panel or Swarm Summary */}
      {!isSwarmMode ? (
        <ResourceRuntimePanel
          resourceRuntime={resourceRuntime}
          humanRequest={humanRequest}
        />
      ) : (
        <Card
          size="small"
          style={{
            borderRadius: 16,
            background: hasIntervention ? "#fff7e6" : "#f5f8ff",
            border: hasIntervention ? "1px solid #ffd591" : "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)"
          }}
          bodyStyle={{ padding: "12px 14px" }}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Flex justify="space-between" align="center">
              <Text strong style={{ fontSize: 13, color: "#1d4ed8" }}>
                🐝 {t('sidepanel:input.swarmCockpit')} {t('common:status.running')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {completedCount}/{totalCount}
              </Text>
            </Flex>

            <Progress
              percent={totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}
              size="small"
              showInfo={false}
              strokeColor="#1677ff"
            />

            {hasIntervention && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningFilled />}
                message={
                  <Text style={{ fontSize: 12 }}>
                    {interventionAgents.length} {t('sidepanel:process.waitingAuthNotice')}：
                    {interventionAgents.map(a => a.title ?? a.nodeId).join(" · ")}
                  </Text>
                }
                style={{ borderRadius: 8, padding: "6px 10px" }}
              />
            )}

            {cockpitTabId != null && (
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                onClick={() => jumpToCockpit(cockpitTabId)}
                style={{ width: "100%", borderRadius: 8 }}
              >
                {t('common:action.open')} {t('sidepanel:input.swarmCockpit')}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* 3. Unified Agent Monitor (Core) - Frameless by default in sidepanel */}
      <AgentMonitor 
        agent={agentState} 
        nodes={nodes} 
        layout="sidepanel" 
      />
    </Space>
  );
};

