import React, { useState, useMemo, useEffect } from "react";
import { Space, Typography, Tag, Button, Collapse } from "antd";
import { ThoughtChain } from "@ant-design/x";
import type { ThoughtChainProps } from "@ant-design/x";
import { ClockCircleOutlined, InfoCircleOutlined, ReadOutlined } from "@ant-design/icons";
import { WorkflowTreeNode } from "../../../sidepanel/components/antx/workflow";
import { getSemanticNode } from "../../../sidepanel/components/antx/workflow-node-meta";
import { WorkflowThinkingBlock, shouldRenderInlineThinking } from "../../../sidepanel/components/antx/workflow-thinking";
import { MemoryDetailModal } from "../../../sidepanel/components/antx/MemoryDetailModal";
import type { MemoryLevel, NodeMemoryDetailItem, NodeMemoryDetails } from "../../../shared/types/memory";

const { Text } = Typography;

function formatDuration(ms: number) {
  const s = ms / 1000;
  if (s < 0.1) return "0.1s";
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${Math.round(s)}s`;
}

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

const DynamicTimer: React.FC<{ startTs: number }> = ({ startTs }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  return <span>{formatDuration(Math.max(0, now - startTs))}</span>;
};

export interface AgentChainProps {
  nodes: WorkflowTreeNode[];
  onNodeClick?: (node: WorkflowTreeNode) => void;
  filterTaskRunId?: string;
}

export const AgentChain: React.FC<AgentChainProps> = ({ nodes, onNodeClick, filterTaskRunId }) => {
  const [selectedMemory, setSelectedMemory] = useState<{
    item: NodeMemoryDetailItem;
    refresh?: NodeMemoryDetails["refresh"];
  } | null>(null);

  const flattenNodes = (treeNodes: WorkflowTreeNode[]): WorkflowTreeNode[] => {
    return treeNodes.reduce((acc, node) => {
      acc.push(node);
      if (node.children && node.children.length > 0) {
        acc.push(...flattenNodes(node.children));
      }
      return acc;
    }, [] as WorkflowTreeNode[]);
  };

  const filteredNodes = useMemo(() => {
    return filterTaskRunId
      ? nodes.filter(n => n.taskRunId === filterTaskRunId)
      : nodes;
  }, [nodes, filterTaskRunId]);

  const flatNodes = useMemo(() => flattenNodes(filteredNodes), [filteredNodes]);

  const items: NonNullable<ThoughtChainProps["items"]> = flatNodes.map((node) => {
    const semantic = getSemanticNode(node.nodeName);
    const memory = extractMemoryUsage(node);
    const memoryDetails = extractMemoryDetails(node);
    const memoryCount = memoryDetails?.items.length ?? memory?.count ?? 0;
    const timerStartTs = node.startedAt ?? node.updatedAt;
    const showInlineThinking = shouldRenderInlineThinking(node);
    
    let status: ThoughtChainProps["items"][0]["status"] = undefined;
    if (node.status === "running") status = "loading";
    if (node.status === "done") status = "success";
    if (node.status === "error") status = "error";

    const content = (showInlineThinking || memory) ? (
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
                    {memoryDetails ? (
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        {(["L1", "L2", "L3"] as MemoryLevel[]).map((level) => {
                          const items = memoryDetails.items.filter((item) => item.level === level);
                          if (items.length === 0) return null;
                          return (
                            <div key={level}>
                              <Text strong style={{ fontSize: 12, color: "#334155" }}>
                                {levelLabels[level]} · {items.length} 条
                              </Text>
                              <div style={{ marginTop: 4 }}>
                                {items.map((item, index) => (
                                  <Button
                                    key={`${item.id || level}-${index}`}
                                    size="small"
                                    type="link"
                                    style={{ padding: "0 4px", fontSize: 12, height: "auto" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMemory({ item, refresh: memoryDetails.refresh });
                                    }}
                                  >
                                    {item.title}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </Space>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {memory.l1.length > 0 && <li>页面级经验 (L1): {memory.l1.length} 条</li>}
                        {memory.l2.length > 0 && <li>工具级经验 (L2): {memory.l2.length} 条</li>}
                        {memory.l3.length > 0 && <li>策略级经验 (L3): {memory.l3.length} 条</li>}
                      </ul>
                    )}
                  </div>
                )
              }
            ]}
          />
        )}
      </Space>
    ) : undefined;

    return {
      key: node.id,
      status,
      icon: semantic.icon,
      title: (
        <Space 
          size={8} 
          onClick={() => onNodeClick?.(node)} 
          style={{ cursor: onNodeClick ? "pointer" : "default" }}
        >
          <Text strong style={{ fontSize: 14, color: onNodeClick ? "#2563eb" : undefined }}>
            {semantic.label}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {node.status === "running" ? (
              <DynamicTimer startTs={timerStartTs} />
            ) : node.durationMs ? (
              formatDuration(node.durationMs)
            ) : null}
          </Text>
        </Space>
      ),
      description: (
        <div 
          onClick={() => onNodeClick?.(node)} 
          style={{ cursor: onNodeClick ? "pointer" : "default" }}
        >
          <Text type="secondary" style={{ fontSize: 13, display: "block", marginTop: 2 }}>
            {node.summary}
          </Text>
        </div>
      ),
      content,
      extra: onNodeClick ? (
        <Button 
          type="link" 
          size="small" 
          icon={<InfoCircleOutlined />} 
          onClick={(e) => {
            e.stopPropagation();
            onNodeClick(node);
          }}
          style={{ padding: "0 4px", fontSize: 12 }}
        >
          详情
        </Button>
      ) : null,
    };
  });

  if (items.length === 0) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", opacity: 0.5 }}>
        <Text type="secondary">暂无执行记录</Text>
      </div>
    );
  }

  return (
    <div className="agent-chain-wrapper">
      <ThoughtChain 
        items={items} 
        size="small"
        style={{ padding: "8px 0" }}
      />
      
      <MemoryDetailModal
        item={selectedMemory?.item ?? null}
        refresh={selectedMemory?.refresh}
        open={!!selectedMemory}
        onClose={() => setSelectedMemory(null)}
      />
    </div>
  );
};

