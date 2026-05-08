import React, { useMemo } from "react";
import { Flex, Space, Typography } from "antd";
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

      {/* 2. Resource Panel (only for single agent mode) */}
      {!isSwarmMode && (
        <ResourceRuntimePanel
          resourceRuntime={resourceRuntime}
          humanRequest={humanRequest}
        />
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
