import React, { useState } from "react";
import { Button, Space, Typography, Collapse } from "antd";
import { ThoughtChain } from "@ant-design/x";
import type { ThoughtChainProps } from "@ant-design/x";
import {
  ReadOutlined,
} from "@ant-design/icons";
import { WorkflowTreeNode } from "./workflow";
import { WorkflowDetailModal } from "./WorkflowDetailModal";
import { MemoryDetailModal } from "./MemoryDetailModal";
import { WorkflowThinkingBlock, shouldRenderInlineThinking } from "./workflow-thinking";
import { getSemanticNode } from "./workflow-node-meta";
import type { MemoryLevel, NodeMemoryDetailItem, NodeMemoryDetails } from "../../../shared/types/memory";

const { Text, Paragraph } = Typography;

function extractMemoryUsage(node: WorkflowTreeNode) {
  const usage = node.rawUpdate?.node_memory_usage;
  if (!usage || typeof usage !== "object") return null;
  const l1 = Array.isArray(usage.l1) ? usage.l1.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const l2 = Array.isArray(usage.l2) ? usage.l2.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const l3 = Array.isArray(usage.l3) ? usage.l3.filter((i: any) => typeof i === "string" && i.trim().length > 0) : [];
  const count = typeof usage.count === "number" ? usage.count : l1.length + l2.length + l3.length;
  const refresh = usage.refresh && typeof usage.refresh === "object" ? usage.refresh : undefined;
  if (count <= 0 && !refresh) return null;
  return { count, l1, l2, l3, refresh };
}

function extractMemoryDetails(node: WorkflowTreeNode): NodeMemoryDetails | null {
  const details = node.rawUpdate?.node_memory_details;
  if (!details || typeof details !== "object") return null;
  const items = Array.isArray(details.items)
    ? details.items.filter((item: unknown): item is NodeMemoryDetailItem => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as NodeMemoryDetailItem;
        return typeof candidate.level === "string" && typeof candidate.title === "string";
      })
    : [];
  if (items.length === 0) return null;
  return { ...(details as NodeMemoryDetails), items };
}

const levelLabels: Record<MemoryLevel, string> = {
  L1: "页面级经验",
  L2: "工具级经验",
  L3: "策略级经验",
};

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
  filterTaskRunId?: string;
}

export const CotaborThoughtChain: React.FC<CotaborThoughtChainProps> = ({ nodes, filterTaskRunId }) => {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<{
    item: NodeMemoryDetailItem;
    refresh?: NodeMemoryDetails["refresh"];
  } | null>(null);

  const renderDescription = (summary: string) => (
    <Paragraph
      style={{
        marginBottom: 0,
        fontSize: 13,
        color: "#374151",
        lineHeight: 1.5,
      }}
      ellipsis={{ rows: 2, tooltip: summary }}
    >
      {summary}
    </Paragraph>
  );

  const flattenNodes = (treeNodes: WorkflowTreeNode[]): WorkflowTreeNode[] => {
    return treeNodes.reduce((acc, node) => {
      acc.push(node);
      if (node.children && node.children.length > 0) {
        acc.push(...flattenNodes(node.children));
      }
      return acc;
    }, [] as WorkflowTreeNode[]);
  };

  const filteredNodes = filterTaskRunId
    ? nodes.filter(n => n.taskRunId === filterTaskRunId)
    : nodes;
  const flatNodes = flattenNodes(filteredNodes);

  const items: NonNullable<ThoughtChainProps["items"]> = flatNodes.map((node) => {
    const semantic = getSemanticNode(node.nodeName);
    const memory = extractMemoryUsage(node);
    const memoryDetails = extractMemoryDetails(node);
    const memoryCount = memoryDetails?.items.length ?? memory?.count ?? 0;
    const timerStartTs = node.startedAt ?? node.updatedAt;
    const rawUpdate = node.rawUpdate as Record<string, any> | undefined;
    const llmPayloads = Array.isArray((rawUpdate as any)?.llm_payloads) ? (rawUpdate as any).llm_payloads : [];
    const debugPayloads = Array.isArray((rawUpdate as any)?.debug_payloads) ? (rawUpdate as any).debug_payloads : [];
    const showInlineThinking = shouldRenderInlineThinking(node);

    let status: "success" | "error" | "abort" | "loading" | undefined = undefined;
    if (node.status === "running") status = "loading";
    if (node.status === "done") status = "success";
    if (node.status === "error") status = "error";

    const hasDebugData =
      showInlineThinking ||
      !!node.detail ||
      !!memory ||
      !!node.thinkingContent ||
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
      description: renderDescription(node.summary),
      blink: node.status === "running",
      status,
      icon: semantic.icon,
      content: hasDebugData ? (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 4 }}>
          {showInlineThinking && <WorkflowThinkingBlock node={node} />}
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
                      <span style={{ fontWeight: 500 }}>
                        {memory.refresh?.mode === "reuse"
                          ? `复用经验库 (命中 ${memoryCount} 条经验)`
                          : memory.refresh?.mode === "partial"
                            ? `轻量刷新经验 (命中 ${memoryCount} 条经验)`
                            : `读取经验库 (匹配到 ${memoryCount} 条经验)`}
                      </span>
                    </Space>
                  ),
                  children: (
                    <div style={{ fontSize: 12, color: '#595959', paddingLeft: 8 }}>
                      {memory.refresh && (
                        <div style={{ marginBottom: 8 }}>
                          {`模式：${memory.refresh.mode}${memory.refresh.reason ? ` · 原因：${memory.refresh.reason}` : ""}${
                            memory.refresh.staleReasons?.length
                              ? ` · 触发条件：${memory.refresh.staleReasons.join(" / ")}`
                              : ""
                          }`}
                        </div>
                      )}
                      {memoryDetails ? (
                        <Space direction="vertical" size={10} style={{ width: "100%" }}>
                          {(["L1", "L2", "L3"] as MemoryLevel[]).map((level) => {
                            const items = memoryDetails.items.filter((item) => item.level === level);
                            if (items.length === 0) return null;
                            return (
                              <div key={level}>
                                <Text strong style={{ fontSize: 12, color: "#334155" }}>
                                  {levelLabels[level]} ({level}) · {items.length} 条
                                </Text>
                                <Space direction="vertical" size={6} style={{ width: "100%", marginTop: 6 }}>
                                  {items.map((item, index) => (
                                    <div
                                      key={`${item.id || level}-${index}`}
                                      style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: "#ffffff",
                                        border: "1px solid #d9f7be",
                                      }}
                                    >
                                      <Space direction="vertical" size={4} style={{ width: "100%" }}>
                                        <Space wrap size={6}>
                                          <Text strong style={{ fontSize: 12 }}>{item.title}</Text>
                                          {item.memoryType === "anti_pattern" && <Text type="danger" style={{ fontSize: 12 }}>反模式</Text>}
                                        </Space>
                                        <Text style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                                          {item.summary || "无摘要"}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                          注入入口：{item.injectionSurface}
                                        </Text>
                                        <Button
                                          size="small"
                                          type="link"
                                          style={{ padding: 0, alignSelf: "flex-start" }}
                                          onClick={() => setSelectedMemory({ item, refresh: memoryDetails.refresh })}
                                        >
                                          查看记忆详情
                                        </Button>
                                      </Space>
                                    </div>
                                  ))}
                                </Space>
                              </div>
                            );
                          })}
                        </Space>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {memory.l1.length > 0 && <li>页面级经验 (L1): {memory.l1.length} 条记录</li>}
                          {memory.l2.length > 0 && <li>工具级经验 (L2): {memory.l2.length} 条记录</li>}
                          {memory.l3.length > 0 && <li>策略级经验 (L3): {memory.l3.length} 条记录</li>}
                        </ul>
                      )}
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
            查看执行详情
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
      <MemoryDetailModal
        item={selectedMemory?.item ?? null}
        refresh={selectedMemory?.refresh}
        open={!!selectedMemory}
        onClose={() => setSelectedMemory(null)}
      />
    </>
  );
};
