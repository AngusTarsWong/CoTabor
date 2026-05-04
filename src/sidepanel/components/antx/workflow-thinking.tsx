import React from "react";
import type { WorkflowNodeRecord, WorkflowTreeNode } from "./workflow";

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

export function getNodeThinkingContent(node: WorkflowThinkingNode): string {
  return normalizeThinkingText(node.thinkingContent) || extractPersistedThinking(node.rawUpdate);
}

export function shouldRenderInlineThinking(node: WorkflowThinkingNode): boolean {
  return node.status === "running" && node.kind === "llm" && getNodeThinkingContent(node).length > 0;
}

export const WorkflowThinkingBlock: React.FC<{
  node: WorkflowNodeRecord | WorkflowTreeNode;
}> = ({ node }) => {
  const thinkingContent = getNodeThinkingContent(node);

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #dbeafe",
        background: "#f8fbff",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: 12,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {thinkingContent}
      </div>
    </div>
  );
};
