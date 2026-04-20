import React, { useMemo } from "react";
import { Modal, Space, Typography } from "antd";
import { WorkflowNodeRecord } from "./workflow";

const { Paragraph, Text } = Typography;

interface ExperienceDetailModalProps {
  open: boolean;
  node: WorkflowNodeRecord | null;
  onClose: () => void;
}

function extractExperienceData(node: WorkflowNodeRecord | null) {
  const update = node?.rawUpdate || {};
  const payloads = Array.isArray(update.llm_payloads) ? update.llm_payloads : [];
  const latestPayload = payloads.length > 0 ? payloads[payloads.length - 1] : null;
  const rawResponse = typeof latestPayload?.response === "string" ? latestPayload.response : "";
  const experienceBuffer = update.experience_buffer || null;

  return {
    rawResponse,
    experienceBuffer,
  };
}

export const ExperienceDetailModal: React.FC<ExperienceDetailModalProps> = ({
  open,
  node,
  onClose,
}) => {
  const { rawResponse, experienceBuffer } = useMemo(() => extractExperienceData(node), [node]);

  return (
    <Modal
      title="本次记忆总结详情"
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Text strong>节点状态</Text>
          <Paragraph style={{ marginBottom: 0, marginTop: 6 }}>
            {node?.status === "running" ? "总结进行中" : node?.status === "error" ? "总结失败" : "总结完成"}
          </Paragraph>
        </div>

        <div>
          <Text strong>提炼后的候选经验</Text>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 240,
              overflow: "auto",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {experienceBuffer ? JSON.stringify(experienceBuffer, null, 2) : "本次未提炼出可提交的候选经验。"}
          </pre>
        </div>

        <div>
          <Text strong>大模型原始输出</Text>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 12,
              background: "#111827",
              color: "#f9fafb",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 320,
              overflow: "auto",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {rawResponse || "未记录到本次总结模型输出。"}
          </pre>
        </div>
      </Space>
    </Modal>
  );
};
