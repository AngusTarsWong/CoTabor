import React, { useState } from "react";
import { Button, Space, Typography, Collapse } from "antd";
import { ThoughtChain } from "@ant-design/x";
import type { ThoughtChainProps } from "@ant-design/x";
import {
  BulbOutlined,
  EyeOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { WorkflowTreeNode } from "./workflow";
import { WorkflowDetailModal } from "./WorkflowDetailModal";

const { Text } = Typography;

const semanticNodeMap: Record<string, { label: string; icon: React.ReactNode }> = {
  planner: { label: "思考与规划", icon: <BulbOutlined /> },
  cortex: { label: "观察与操作", icon: <EyeOutlined /> },
  cortex_planner_executor: { label: "生成并执行动作", icon: <ToolOutlined /> },
  cortex_evaluator: { label: "评估视觉反馈", icon: <SearchOutlined /> },
  watchdog: { label: "检查执行结果", icon: <SafetyCertificateOutlined /> },
  memory: { label: "翻阅经验库", icon: <ReadOutlined /> },
  experience: { label: "提炼经验", icon: <ThunderboltOutlined /> },
  experience_job: { label: "后台沉淀经验", icon: <SaveOutlined /> },
  replanner: { label: "尝试恢复错误", icon: <SyncOutlined /> },
  executor: { label: "执行动作", icon: <ThunderboltOutlined /> },
  human: { label: "等待人类协助", icon: <UserOutlined /> },
};

function getSemanticNode(nodeName: string) {
  return semanticNodeMap[nodeName] || { label: nodeName, icon: <RobotOutlined /> };
}

function extractMemoryUsage(node: WorkflowTreeNode) {
  const usage = node.rawUpdate?.node_memory_usage;
  if (!usage || typeof usage !== "object") return null;
  const l1 = Array.isArray(usage.l1) ? usage.l1.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const l2 = Array.isArray(usage.l2) ? usage.l2.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const l3 = Array.isArray(usage.l3) ? usage.l3.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const count = typeof usage.count === "number" ? usage.count : l1.length + l2.length + l3.length;
  if (count <= 0) return null;
  return { count, l1, l2, l3 };
}

function formatDuration(ms: number) {
  const s = ms / 1000;
  if (s < 0.1) return "0.1s";
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${Math.round(s)}s`;
}

const DynamicTimer: React.FC<{ startTs: number }> = ({ startTs }) => {
  const [now, setNow] = useState(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  return <span>{formatDuration(Math.max(0, now - startTs))}</span>;
};

interface CotaborThoughtChainProps {
  nodes: WorkflowTreeNode[];
}

export const CotaborThoughtChain: React.FC<CotaborThoughtChainProps> = ({ nodes }) => {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const flattenNodes = (treeNodes: WorkflowTreeNode[]): WorkflowTreeNode[] => {
    return treeNodes.reduce((acc, node) => {
      acc.push(node);
      if (node.children && node.children.length > 0) {
        acc.push(...flattenNodes(node.children));
      }
      return acc;
    }, [] as WorkflowTreeNode[]);
  };

  const flatNodes = flattenNodes(nodes);

  const items: NonNullable<ThoughtChainProps["items"]> = flatNodes.map((node) => {
    const semantic = getSemanticNode(node.nodeName);
    const memory = extractMemoryUsage(node);
    const timerStartTs = node.startedAt ?? node.updatedAt;
    const rawUpdate = node.rawUpdate as Record<string, any> | undefined;
    const llmPayloads = Array.isArray((rawUpdate as any)?.llm_payloads) ? (rawUpdate as any).llm_payloads : [];
    const debugPayloads = Array.isArray((rawUpdate as any)?.debug_payloads) ? (rawUpdate as any).debug_payloads : [];

    let status: "success" | "error" | "abort" | "loading" | undefined = undefined;
    if (node.status === "running") status = "loading";
    if (node.status === "done") status = "success";
    if (node.status === "error") status = "error";

    const hasDebugData =
      !!node.detail ||
      !!memory ||
      !!node.streamContent ||
      !!rawUpdate ||
      llmPayloads.length > 0 ||
      debugPayloads.length > 0;

    return {
      title: (
        <Space size={8}>
          <span>{semantic.label}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {node.status === "running" ? (
              <DynamicTimer startTs={timerStartTs} />
            ) : node.durationMs ? (
              formatDuration(node.durationMs)
            ) : null}
          </Text>
          {node.tokens != null && node.tokens > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {node.tokens.toLocaleString()} tokens
            </Text>
          )}
        </Space>
      ),
      description: node.summary,
      status,
      icon: semantic.icon,
      content: hasDebugData ? (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 4 }}>
          {memory && (
            <Collapse
              size="small"
              ghost
              style={{ background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f', padding: 0 }}
              items={[
                {
                  key: '1',
                  label: (
                    <Space style={{ color: '#389e0d', fontSize: 13 }}>
                      <ReadOutlined />
                      <span style={{ fontWeight: 500 }}>读取经验库 (匹配到 {memory.count} 条经验)</span>
                    </Space>
                  ),
                  children: (
                    <div style={{ fontSize: 12, color: '#595959', paddingLeft: 8 }}>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {memory.l1.length > 0 && <li>页面级经验 (L1): {memory.l1.length} 条记录</li>}
                        {memory.l2.length > 0 && <li>工具级经验 (L2): {memory.l2.length} 条记录</li>}
                        {memory.l3.length > 0 && <li>策略级经验 (L3): {memory.l3.length} 条记录</li>}
                      </ul>
                    </div>
                  )
                }
              ]}
            />
          )}
          <Button
            size="small"
            type="link"
            style={{ padding: 0 }}
            onClick={() => setExpandedNodeId(node.id)}
          >
            {node.status === "running" ? "查看实时状态" : "查看执行详情"}
          </Button>
        </Space>
      ) : undefined,
    };
  });

  if (items.length === 0) return null;

  const expandedNode = expandedNodeId ? flatNodes.find(n => n.id === expandedNodeId) : null;

  return (
    <>
      <ThoughtChain items={items} />
      <WorkflowDetailModal node={expandedNode || null} onClose={() => setExpandedNodeId(null)} />
    </>
  );
};
