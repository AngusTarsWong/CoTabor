import React, { useMemo, useState } from "react";
import { Card, Space, Tag, Typography } from "antd";
import {
  CheckCircleFilled,
  ClockCircleFilled,
  DownOutlined,
  ExclamationCircleFilled,
  RightOutlined,
} from "@ant-design/icons";
import { WorkflowTreeNode } from "./workflow";
import { getSemanticNode } from "./workflow-node-meta";

const { Text, Paragraph } = Typography;

interface WorkflowNodeCardProps {
  node: WorkflowTreeNode;
}

const statusIconMap = {
  done: <CheckCircleFilled style={{ color: "#16a34a" }} />,
  running: <ClockCircleFilled style={{ color: "#2563eb" }} />,
  error: <ExclamationCircleFilled style={{ color: "#dc2626" }} />,
  waiting: <ClockCircleFilled style={{ color: "#d97706" }} />,
} as const;

function getNodeBackground(depth: number) {
  if (depth <= 0) return "#ffffff";
  if (depth === 1) return "#fbfdff";
  return "#f7fbff";
}

function extractMemoryUsage(node: WorkflowTreeNode): {
  count: number;
  l1: string[];
  l2: string[];
  l3: string[];
} | null {
  const usage = node.rawUpdate?.node_memory_usage;
  if (!usage || typeof usage !== "object") return null;
  const l1 = Array.isArray(usage.l1) ? usage.l1.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const l2 = Array.isArray(usage.l2) ? usage.l2.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const l3 = Array.isArray(usage.l3) ? usage.l3.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const count = typeof usage.count === "number" ? usage.count : l1.length + l2.length + l3.length;
  if (count <= 0) return null;
  return { count, l1, l2, l3 };
}

function MemoryUsageSection(props: {
  title: string;
  items: string[];
}) {
  if (props.items.length === 0) return null;
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Text strong style={{ fontSize: 12, color: "#334155" }}>
        {props.title}
      </Text>
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        {props.items.map((item, index) => (
          <Text
            key={`${props.title}-${index}`}
            style={{
              color: "#475569",
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {`- ${item}`}
          </Text>
        ))}
      </Space>
    </Space>
  );
}

export const WorkflowNodeCard: React.FC<WorkflowNodeCardProps> = ({ node }) => {
  const [expanded, setExpanded] = useState(node.status === "running" || node.status === "error" || node.status === "waiting");
  const userToggledRef = React.useRef(false);
  const prevStatusRef = React.useRef(node.status);

  React.useEffect(() => {
    if (prevStatusRef.current === "running" && node.status === "done") {
      if (!userToggledRef.current) {
        setExpanded(false);
      }
    }
    prevStatusRef.current = node.status;
  }, [node.status]);

  const memoryUsage = useMemo(() => extractMemoryUsage(node), [node]);
  const semantic = getSemanticNode(node.nodeName);

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
              <Text strong style={{ color: "#111827", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                {semantic.icon}
                <span>{semantic.label}</span>
              </Text>
            </div>

            <button
              type="button"
              onClick={() => {
                userToggledRef.current = true;
                setExpanded((value) => !value);
              }}
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
            {memoryUsage && (
              <Tag color="green" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                {`知识检索 ${memoryUsage.count}`}
              </Tag>
            )}
          </div>

          <Paragraph
            style={{ marginBottom: 0, color: "#334155", fontSize: 13, lineHeight: 1.6 }}
            ellipsis={{ rows: 2, tooltip: node.summary }}
          >
            {node.summary}
          </Paragraph>

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

              {memoryUsage && (
                <div
                  style={{
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "10px 12px",
                  }}
                >
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 12, color: "#334155" }}>
                      使用到的记忆
                    </Text>
                    <MemoryUsageSection title="L1 页面操作经验" items={memoryUsage.l1} />
                    <MemoryUsageSection title="L2 工具调用经验" items={memoryUsage.l2} />
                    <MemoryUsageSection title="L3 任务策略经验" items={memoryUsage.l3} />
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
    </div>
  );
};
