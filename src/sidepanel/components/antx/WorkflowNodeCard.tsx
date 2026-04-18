import React, { useMemo, useState } from "react";
import { Button, Card, Modal, Space, Tag, Typography } from "antd";
import {
  CheckCircleFilled,
  ClockCircleFilled,
  DownOutlined,
  ExclamationCircleFilled,
  RightOutlined,
} from "@ant-design/icons";
import { WorkflowTreeNode } from "./workflow";

const { Text } = Typography;

interface WorkflowNodeCardProps {
  node: WorkflowTreeNode;
}

const statusIconMap = {
  done: <CheckCircleFilled style={{ color: "#16a34a" }} />,
  running: <ClockCircleFilled style={{ color: "#2563eb" }} />,
  error: <ExclamationCircleFilled style={{ color: "#dc2626" }} />,
  waiting: <ClockCircleFilled style={{ color: "#d97706" }} />,
} as const;

const kindColorMap = {
  llm: "blue",
  system: "default",
  human: "gold",
  subgraph: "purple",
} as const;

function getNodeBackground(depth: number) {
  if (depth <= 0) return "#ffffff";
  if (depth === 1) return "#fbfdff";
  return "#f7fbff";
}

function formatMeta(node: WorkflowTreeNode) {
  const parts: string[] = [];
  if (node.modelName) parts.push(node.modelName);
  if (typeof node.durationMs === "number") parts.push(`${(node.durationMs / 1000).toFixed(1)}s`);
  if (typeof node.tokens === "number" && node.tokens > 0) parts.push(`${node.tokens} tokens`);
  return parts.join(" · ");
}

export const WorkflowNodeCard: React.FC<WorkflowNodeCardProps> = ({ node }) => {
  const hasRawUpdate = !!node.rawUpdate && Object.keys(node.rawUpdate).length > 0;
  const hasExpandableContent = !!node.detail || !!node.streamContent || hasRawUpdate || node.children.length > 0;
  const [expanded, setExpanded] = useState(node.status === "running" || node.status === "error" || node.status === "waiting");
  const [rawModalOpen, setRawModalOpen] = useState(false);

  const meta = useMemo(() => formatMeta(node), [node]);

  return (
    <div
      style={{
        position: "relative",
        marginLeft: node.depth * 18,
        paddingLeft: node.depth > 0 ? 18 : 0,
      }}
    >
      {node.depth > 0 && (
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            width: 1,
            background: "linear-gradient(180deg, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0.04) 100%)",
          }}
        />
      )}

      <Card
        size="small"
        style={{
          borderRadius: 18,
          border: `1px solid ${node.status === "error" ? "#fecaca" : node.status === "running" ? "#bfdbfe" : "#e5eef9"}`,
          background: getNodeBackground(node.depth),
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
          overflow: "hidden",
        }}
        bodyStyle={{ padding: "14px 16px" }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{statusIconMap[node.status]}</span>
              <Text strong style={{ color: "#111827", fontSize: 15 }}>
                {node.nodeName}
              </Text>
            </div>

            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              style={{
                border: "none",
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
              }}
              title={expanded ? "折叠节点详情" : "展开节点详情"}
            >
              {expanded ? <DownOutlined /> : <RightOutlined />}
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Tag color={kindColorMap[node.kind]} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
              {node.kind.toUpperCase()}
            </Tag>
            {node.subgraphName && (
              <Tag color="cyan" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                {`Subgraph: ${node.subgraphName}`}
              </Tag>
            )}
            {meta && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {meta}
              </Text>
            )}
          </div>

          <Text style={{ color: "#334155", fontSize: 13, lineHeight: 1.6 }}>{node.summary}</Text>

          {expanded && (
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              {node.detail && (
                <div
                  style={{
                    borderRadius: 12,
                    background: node.status === "error" ? "#fff7f7" : "#f8fafc",
                    border: `1px solid ${node.status === "error" ? "#fecaca" : "#eef2f7"}`,
                    padding: "10px 12px",
                  }}
                >
                  <Text
                    style={{
                      color: node.status === "error" ? "#991b1b" : "#475569",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {node.detail}
                  </Text>
                </div>
              )}

              {node.streamContent && (
                <div
                  style={{
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "10px 12px",
                  }}
                >
                  <Text strong style={{ fontSize: 12, color: "#334155" }}>流式输出</Text>
                  <pre
                    style={{
                      margin: "8px 0 0",
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "#475569",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {node.streamContent}
                  </pre>
                </div>
              )}

              {hasRawUpdate && (
                <div
                  style={{
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "10px 12px",
                  }}
                >
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 12, color: "#334155" }}>节点原始更新数据</Text>
                    <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      原始更新数据较长，已从侧边栏内联区域移出。点击下方按钮可在大弹窗中查看完整内容。
                    </Text>
                    <Button
                      type="default"
                      onClick={() => setRawModalOpen(true)}
                      style={{ alignSelf: "flex-start", borderRadius: 10 }}
                    >
                      查看原始数据
                    </Button>
                  </Space>
                </div>
              )}
            </Space>
          )}

          {expanded && node.children.length > 0 && (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {node.children.map((child) => (
                <WorkflowNodeCard key={child.id} node={child} />
              ))}
            </Space>
          )}
        </Space>
      </Card>

      <Modal
        open={rawModalOpen}
        onCancel={() => setRawModalOpen(false)}
        footer={null}
        width={720}
        title={`节点原始更新数据 · ${node.nodeName}`}
        styles={{
          body: {
            paddingTop: 8,
          },
        }}
      >
        <pre
          style={{
            margin: 0,
            maxHeight: "70vh",
            overflow: "auto",
            padding: "14px 16px",
            borderRadius: 14,
            background: "#0f172a",
            border: "1px solid #1e293b",
            color: "#cbd5e1",
            fontSize: 12,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {JSON.stringify(node.rawUpdate, null, 2)}
        </pre>
      </Modal>
    </div>
  );
};
