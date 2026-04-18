import React, { useMemo } from "react";
import { Card, Flex, Space, Tag, Typography } from "antd";
import { CheckCircleFilled, ClockCircleFilled, PauseCircleFilled } from "@ant-design/icons";
import { RuntimeStats } from "../../hooks/useAppLogs";
import { HumanRequest } from "../../../lib/claw";
import {
  WorkflowNodeRecord,
  WorkflowTreeNode,
  buildWorkflowNodeFromHumanRequest,
  buildWorkflowTree,
} from "./workflow";
import { WorkflowNodeCard } from "./WorkflowNodeCard";

const { Text } = Typography;

interface ProcessPanelProps {
  workflowNodes: WorkflowNodeRecord[];
  runtimeStats: RuntimeStats | null;
  isAgentRunning: boolean;
  isAgentStopping: boolean;
  humanRequest: HumanRequest | null;
}

const statusTag = (isAgentRunning: boolean, isAgentStopping: boolean, humanRequest: HumanRequest | null) => {
  if (humanRequest) return <Tag color="gold" style={{ borderRadius: 999, marginInlineEnd: 0 }}>等待授权</Tag>;
  if (isAgentStopping) return <Tag color="gold" style={{ borderRadius: 999, marginInlineEnd: 0 }}>停止中</Tag>;
  if (isAgentRunning) return <Tag color="processing" style={{ borderRadius: 999, marginInlineEnd: 0 }}>运行中</Tag>;
  return <Tag color="success" style={{ borderRadius: 999, marginInlineEnd: 0 }}>已完成</Tag>;
};

export const ProcessPanel: React.FC<ProcessPanelProps> = ({
  workflowNodes,
  runtimeStats,
  isAgentRunning,
  isAgentStopping,
  humanRequest,
}) => {
  const nodes = useMemo<WorkflowTreeNode[]>(() => {
    const items = [...workflowNodes];
    if (humanRequest) {
      items.push(buildWorkflowNodeFromHumanRequest(humanRequest, workflowNodes.length + 1));
    }
    return buildWorkflowTree(items);
  }, [humanRequest, workflowNodes]);

  if (nodes.length === 0 && !isAgentStopping) return null;

  const activeSummary = humanRequest
    ? "当前：等待用户授权"
    : isAgentStopping
      ? "当前：等待当前步骤完成后停止"
      : runtimeStats
        ? `当前：${runtimeStats.node}`
        : "当前：等待下一步工作流事件";

  return (
    <Card
      size="small"
      style={{
        borderRadius: 20,
        borderColor: "#dbeafe",
        background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
      }}
      bodyStyle={{ padding: 18 }}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center" gap={12}>
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 16, color: "#111827" }}>
              Agent 工作流
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeSummary}
            </Text>
            {runtimeStats && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {`步骤 #${runtimeStats.stepNo} · 累计 ${runtimeStats.totalTokens} tokens`}
              </Text>
            )}
          </Space>
          {statusTag(isAgentRunning, isAgentStopping, humanRequest)}
        </Flex>

        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {nodes.map((node) => (
            <WorkflowNodeCard key={node.id} node={node} />
          ))}

          {isAgentStopping && !humanRequest && (
            <Card
              size="small"
              style={{
                borderRadius: 18,
                border: "1px solid #fde68a",
                background: "#fffdf5",
                boxShadow: "0 8px 24px rgba(217, 119, 6, 0.08)",
              }}
              bodyStyle={{ padding: "14px 16px" }}
            >
              <Space align="start" size={10}>
                <ClockCircleFilled style={{ color: "#d97706", fontSize: 16, marginTop: 2 }} />
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: "#92400e" }}>stopping</Text>
                  <Text style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>
                    已收到强制停止请求，当前任务会在本步骤收尾后安全停止，不会进入下一节点。
                  </Text>
                </Space>
              </Space>
            </Card>
          )}

          {!isAgentRunning && !isAgentStopping && !humanRequest && nodes.length > 0 && (
            <Card
              size="small"
              style={{
                borderRadius: 18,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                boxShadow: "0 8px 24px rgba(22, 163, 74, 0.06)",
              }}
              bodyStyle={{ padding: "14px 16px" }}
            >
              <Space align="start" size={10}>
                <CheckCircleFilled style={{ color: "#16a34a", fontSize: 16, marginTop: 2 }} />
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: "#166534" }}>completed</Text>
                  <Text style={{ color: "#166534", fontSize: 13, lineHeight: 1.6 }}>
                    本轮 Agent 工作流已经稳定结束，可以继续发起新的任务。
                  </Text>
                </Space>
              </Space>
            </Card>
          )}

          {humanRequest && (
            <Card
              size="small"
              style={{
                borderRadius: 18,
                border: "1px solid #fde68a",
                background: "#fffdf5",
                boxShadow: "0 8px 24px rgba(217, 119, 6, 0.08)",
              }}
              bodyStyle={{ padding: "14px 16px" }}
            >
              <Space align="start" size={10}>
                <PauseCircleFilled style={{ color: "#d97706", fontSize: 16, marginTop: 2 }} />
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: "#92400e" }}>human</Text>
                  <Text style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>{humanRequest.message}</Text>
                  {humanRequest.action_description && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {humanRequest.action_description}
                    </Text>
                  )}
                </Space>
              </Space>
            </Card>
          )}
        </Space>
      </Space>
    </Card>
  );
};
