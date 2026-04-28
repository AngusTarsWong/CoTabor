import React from "react";
import { Button, Card, Divider, List, Space, Tag, Typography } from "antd";
import { HistoryOutlined, RedoOutlined } from "@ant-design/icons";
import type { ReplayableDagNode } from "../../../core/orchestrator/replay/TaskRunReplay";
import type { ReplayableDagBranchTarget } from "../../../core/orchestrator/replay/DagPartialReplay";

const { Paragraph, Text } = Typography;

interface DagReplayPanelProps {
  nodes: ReplayableDagNode[];
  branches: ReplayableDagBranchTarget[];
  loadingKey?: string | null;
  disabled?: boolean;
  onReplay: (taskRunId: string) => void;
  onReplayBranch: (failedNodeId: string) => void;
}

export const DagReplayPanel: React.FC<DagReplayPanelProps> = ({
  nodes,
  branches,
  loadingKey,
  disabled = false,
  onReplay,
  onReplayBranch,
}) => {
  if (nodes.length === 0 && branches.length === 0) {
    return null;
  }

  return (
    <Card
      size="small"
      style={{
        borderRadius: 18,
        border: "1px solid #dbeafe",
        background: "#ffffff",
        boxShadow: "0 8px 20px rgba(37, 99, 235, 0.06)",
      }}
      bodyStyle={{ padding: "14px 16px" }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space align="center" size={8}>
          <HistoryOutlined style={{ color: "#2563eb" }} />
          <Text strong style={{ color: "#1e3a8a" }}>
            DAG 重放
          </Text>
          <Tag color="processing" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
            {nodes.length} 节点
          </Tag>
        </Space>

        {branches.length > 0 ? (
          <>
            <Text strong style={{ color: "#111827" }}>失败分支局部重跑</Text>
            <List
              size="small"
              dataSource={branches}
              renderItem={(branch) => {
                const loadingBranch = loadingKey === `branch:${branch.failedNodeId}`;
                return (
                  <List.Item
                    style={{ paddingInline: 0 }}
                    actions={[
                      <Button
                        key={branch.failedNodeId}
                        size="small"
                        type="link"
                        icon={<RedoOutlined />}
                        loading={loadingBranch}
                        disabled={disabled || loadingBranch}
                        onClick={() => onReplayBranch(branch.failedNodeId)}
                      >
                        局部重跑
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={8} wrap>
                          <Text strong>{branch.title}</Text>
                          <Tag color="error" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                            failed
                          </Tag>
                          {branch.reusedNodeIds.length > 0 ? (
                            <Tag color="cyan" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                              reuse {branch.reusedNodeIds.length}
                            </Tag>
                          ) : null}
                          {branch.blockedNodeIds.length > 0 ? (
                            <Tag color="gold" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                              blocked {branch.blockedNodeIds.length}
                            </Tag>
                          ) : null}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            重跑节点: {branch.rerunNodeIds.join(" -> ")}
                          </Text>
                          {branch.reusedNodeIds.length > 0 ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              复用前驱: {branch.reusedNodeIds.join(" -> ")}
                            </Text>
                          ) : null}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
            {nodes.length > 0 ? <Divider style={{ margin: "4px 0" }} /> : null}
          </>
        ) : null}

        {nodes.length > 0 ? (
          <>
            <Text strong style={{ color: "#111827" }}>单节点重放</Text>
            <List
              size="small"
              dataSource={nodes}
              renderItem={(node) => {
                const isLoading = loadingKey === `node:${node.taskRunId}`;
                return (
                  <List.Item
                    style={{ paddingInline: 0 }}
                    actions={[
                      <Button
                        key={node.taskRunId}
                        size="small"
                        type="link"
                        icon={<RedoOutlined />}
                        loading={isLoading}
                        disabled={disabled || isLoading}
                        onClick={() => onReplay(node.taskRunId)}
                      >
                        重放节点
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={8} wrap>
                          <Text strong>{node.title}</Text>
                          <Tag color={node.success ? "success" : "error"} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                            {node.success ? "success" : "failed"}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          {node.summary ? (
                            <Paragraph
                              ellipsis={{ rows: 2, expandable: false }}
                              style={{ marginBottom: 0, color: "#64748b", fontSize: 12 }}
                            >
                              {node.summary}
                            </Paragraph>
                          ) : null}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            taskRunId: {node.taskRunId}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </>
        ) : null}
      </Space>
    </Card>
  );
};
