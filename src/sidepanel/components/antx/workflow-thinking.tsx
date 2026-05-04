import React from "react";
import { Think } from "@ant-design/x";
import { Typography } from "antd";
import type { WorkflowNodeRecord, WorkflowTreeNode } from "./workflow";

const { Text } = Typography;

type WorkflowThinkingNode = Pick<WorkflowNodeRecord, "kind" | "status" | "thinkingContent" | "rawUpdate">;

function normalizeThinkingText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractPersistedThinking(rawUpdate?: Record<string, any>): string {
  const candidates = [
    rawUpdate?.thinkingContent,
    rawUpdate?.thinking_content,
    rawUpdate?.planner_output?.thought,
    rawUpdate?.replanner_output?.thought,
    rawUpdate?.cortex_output?.thought,
    rawUpdate?.cortex_thought,
  ];

  for (const candidate of candidates) {
    const text = normalizeThinkingText(candidate);
    if (text) return text;
  }
  return "";
}

export function isThinkingCompatibleNode(node: WorkflowThinkingNode): boolean {
  return node.kind === "llm";
}

export function getNodeThinkingContent(node: WorkflowThinkingNode): string {
  return normalizeThinkingText(node.thinkingContent) || extractPersistedThinking(node.rawUpdate);
}

export function shouldRenderInlineThinking(node: WorkflowThinkingNode): boolean {
  return node.status === "running" && isThinkingCompatibleNode(node);
}

export const WorkflowThinkingPanel: React.FC<{
  node: WorkflowNodeRecord | WorkflowTreeNode;
}> = ({ node }) => {
  const thinkingContent = getNodeThinkingContent(node);

  return (
    <Think
      title="思考中"
      loading
      blink
      expanded={Boolean(thinkingContent)}
      styles={{
        root: {
          borderRadius: 14,
          border: "1px solid #dbeafe",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        },
        status: {
          padding: "10px 12px",
        },
        content: {
          padding: thinkingContent ? "0 12px 12px" : 0,
        },
      }}
    >
      {thinkingContent ? (
        <Text
          style={{
            display: "block",
            color: "#64748b",
            fontSize: 12,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {thinkingContent}
        </Text>
      ) : null}
    </Think>
  );
};
