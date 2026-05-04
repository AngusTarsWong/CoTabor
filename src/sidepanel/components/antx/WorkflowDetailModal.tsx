import React, { useMemo } from "react";
import { Card, Collapse, Empty, Image, Modal, Space, Tag, Typography } from "antd";
import { WorkflowTreeNode } from "./workflow";
import { getNodeThinkingContent } from "./workflow-thinking";

const { Paragraph, Text } = Typography;

type MediaItem = {
  title: string;
  src: string;
};

function toDataUrl(data?: string, mimeType = "image/jpeg") {
  if (!data) return "";
  if (data.includes("<base64_hidden")) return "";
  if (data.startsWith("data:")) return data;
  return `data:${mimeType};base64,${data}`;
}

function toDisplayText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return toDisplayText(messages);
  }
  return messages
    .map((message, index) => {
      if (Array.isArray(message) && message.length >= 2) {
        return `[${index + 1}] ${String(message[0])}\n${toDisplayText(message[1])}`;
      }
      if (typeof message === "object" && message) {
        const role = (message as any).role || (message as any).type || `message_${index + 1}`;
        const content = (message as any).content ?? message;
        return `[${index + 1}] ${String(role)}\n${toDisplayText(content)}`;
      }
      return `[${index + 1}]\n${toDisplayText(message)}`;
    })
    .join("\n\n");
}

function sanitizeRawUpdate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRawUpdate(item));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 5000) {
      return `${value.slice(0, 5000)}\n...<truncated>`;
    }
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (key === "screenshot" && typeof child === "string" && child.length > 0) {
        return [key, `<image ${child.length} chars>`];
      }
      if (key === "media" && Array.isArray(child)) {
        return [
          key,
          child.map((item) => ({
            ...(item as Record<string, unknown>),
            data: (item as any)?.data ? "<image data>" : undefined,
          })),
        ];
      }
      return [key, sanitizeRawUpdate(child)];
    })
  );
}

function collectMedia(node: WorkflowTreeNode | null): MediaItem[] {
  if (!node) return [];
  const update = node.rawUpdate || {};
  const media: MediaItem[] = [];
  const pushMedia = (title: string, data?: string, mimeType?: string) => {
    const src = toDataUrl(data, mimeType);
    if (!src) return;
    media.push({ title, src });
  };

  if (typeof update.screenshot === "string" && update.screenshot) {
    pushMedia("节点截图", update.screenshot);
  }

  const llmPayloads = Array.isArray(update.llm_payloads) ? update.llm_payloads : [];
  llmPayloads.forEach((payload: any, index: number) => {
    const payloadMedia = Array.isArray(payload?.media) ? payload.media : [];
    payloadMedia.forEach((item: any, mediaIndex: number) => {
      pushMedia(
        item?.title || `模型图片 ${index + 1}-${mediaIndex + 1}`,
        item?.data,
        item?.mimeType,
      );
    });
  });

  const debugPayloads = Array.isArray(update.debug_payloads) ? update.debug_payloads : [];
  debugPayloads.forEach((payload: any, index: number) => {
    const payloadMedia = Array.isArray(payload?.media) ? payload.media : [];
    payloadMedia.forEach((item: any, mediaIndex: number) => {
      pushMedia(
        item?.title || `调试图片 ${index + 1}-${mediaIndex + 1}`,
        item?.data,
        item?.mimeType,
      );
    });
  });

  return media.filter((item, index, arr) => arr.findIndex((candidate) => candidate.src === item.src) === index);
}

function PreBlock(props: { text: string; dark?: boolean }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 12,
        background: props.dark ? "#111827" : "#f8fafc",
        color: props.dark ? "#f9fafb" : "#334155",
        border: props.dark ? "1px solid #1f2937" : "1px solid #e5e7eb",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 280,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {props.text}
    </pre>
  );
}

function SectionCard(props: {
  title: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <Card size="small" title={props.title} extra={props.extra} style={{ borderRadius: 14 }}>
      {props.children}
    </Card>
  );
}

interface WorkflowDetailModalProps {
  node: WorkflowTreeNode | null;
  onClose: () => void;
}

export const WorkflowDetailModal: React.FC<WorkflowDetailModalProps> = ({
  node,
  onClose,
}) => {
  const mediaItems = useMemo(() => collectMedia(node), [node]);
  const rawUpdate = node?.rawUpdate || {};
  const llmPayloads = Array.isArray(rawUpdate.node_llm_payloads) ? rawUpdate.node_llm_payloads : [];
  const debugPayloads = Array.isArray(rawUpdate.debug_payloads) ? rawUpdate.debug_payloads : [];
  const sanitizedState = useMemo(() => sanitizeRawUpdate(rawUpdate), [rawUpdate]);
  const thinkingContent = node ? getNodeThinkingContent(node) : "";
  const showThinkingSection = thinkingContent.length > 0;

  const llmItems = llmPayloads.map((payload: any, index: number) => {
    const modelName = payload?.model || payload?.payload?.model || "unknown";
    const tokenUsage = payload?.token_usage || {};
    const sections = [
      payload?.payload?.systemPrompt
        ? { label: "System Prompt", text: toDisplayText(payload.payload.systemPrompt) }
        : null,
      payload?.payload?.userPrompt
        ? { label: "User Prompt", text: toDisplayText(payload.payload.userPrompt) }
        : null,
      payload?.payload?.prompt
        ? { label: "Prompt", text: toDisplayText(payload.payload.prompt) }
        : null,
      payload?.payload?.messages
        ? { label: "Messages", text: formatMessages(payload.payload.messages) }
        : null,
      payload?.payload?.input
        ? { label: "结构化输入", text: toDisplayText(payload.payload.input) }
        : null,
    ].filter(Boolean) as Array<{ label: string; text: string }>;

    return {
      key: `llm-${index}`,
      label: `模型调用 ${index + 1} · ${modelName}`,
      children: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap>
            <Tag color="blue">{modelName}</Tag>
            <Tag>{`prompt ${Number(tokenUsage.prompt ?? 0)}`}</Tag>
            <Tag>{`completion ${Number(tokenUsage.completion ?? 0)}`}</Tag>
            <Tag>{`total ${Number(tokenUsage.total ?? 0)}`}</Tag>
          </Space>
          {sections.map((section) => (
            <div key={section.label}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 8 }}>
                <PreBlock text={section.text} />
              </div>
            </div>
          ))}
          <div>
            <Text strong>模型原始输出</Text>
            <div style={{ marginTop: 8 }}>
              <PreBlock text={toDisplayText(payload?.response) || "未记录"} dark />
            </div>
          </div>
        </Space>
      ),
    };
  });

  const debugItems = debugPayloads.map((payload: any, index: number) => ({
    key: `debug-${index}`,
    label: payload?.title || `调试上下文 ${index + 1}`,
    children: (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {payload?.input ? (
          <div>
            <Text strong>原始输入</Text>
            <div style={{ marginTop: 8 }}>
              <PreBlock text={toDisplayText(payload.input)} />
            </div>
          </div>
        ) : null}
        {payload?.output ? (
          <div>
            <Text strong>输出结果</Text>
            <div style={{ marginTop: 8 }}>
              <PreBlock text={toDisplayText(payload.output)} />
            </div>
          </div>
        ) : null}
      </Space>
    ),
  }));

  return (
    <Modal
      title={node ? `${node.nodeName} 调试详情` : "调试详情"}
      open={!!node}
      onCancel={onClose}
      footer={null}
      width={860}
      destroyOnClose
    >
      {!node ? null : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <SectionCard
            title="节点概览"
            extra={
              <Space wrap>
                <Tag color={node.status === "error" ? "error" : node.status === "running" ? "processing" : "success"}>
                  {node.status}
                </Tag>
                {node.modelName ? <Tag>{node.modelName}</Tag> : null}
                {typeof node.tokens === "number" ? <Tag>{`${node.tokens} tokens`}</Tag> : null}
              </Space>
            }
          >
            <Paragraph style={{ marginBottom: 6 }}>{node.summary}</Paragraph>
            {node.detail ? (
              <>
                <Text strong>节点说明</Text>
                <div style={{ marginTop: 8 }}>
                  <PreBlock text={node.detail} />
                </div>
              </>
            ) : null}
          </SectionCard>

          <SectionCard title="图片与截图">
            {mediaItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点未记录图片或截图" />
            ) : (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {mediaItems.map((item, index) => (
                  <div key={`${item.title}-${index}`}>
                    <Text strong>{item.title}</Text>
                    <div style={{ marginTop: 8 }}>
                      <Image
                        src={item.src}
                        alt={item.title}
                        style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb" }}
                      />
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </SectionCard>

          {showThinkingSection ? (
            <SectionCard title="思考过程">
              <PreBlock text={thinkingContent} />
            </SectionCard>
          ) : null}

          <SectionCard title="模型输入输出">
            {llmItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点未记录模型调用输入" />
            ) : (
              <Collapse items={llmItems} />
            )}
          </SectionCard>

          <SectionCard title="执行上下文">
            {debugItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点未记录额外调试上下文" />
            ) : (
              <Collapse items={debugItems} />
            )}
          </SectionCard>

          <SectionCard title="原始状态快照">
            <PreBlock text={toDisplayText(sanitizedState) || "{}"} />
          </SectionCard>
        </Space>
      )}
    </Modal>
  );
};
