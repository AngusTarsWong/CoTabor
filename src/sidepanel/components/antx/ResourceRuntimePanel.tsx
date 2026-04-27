import React from "react";
import { Card, Flex, Space, Tag, Typography } from "antd";
import { ApartmentOutlined, LinkOutlined } from "@ant-design/icons";
import type { SandboxRuntimeSnapshot } from "../../../core/orchestrator/types/ResourceRuntime";
import type { HumanRequest } from "../../../lib/claw";

const { Text } = Typography;

interface ResourceRuntimePanelProps {
  resourceRuntime: SandboxRuntimeSnapshot | null;
  humanRequest: HumanRequest | null;
}

function simplifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export const ResourceRuntimePanel: React.FC<ResourceRuntimePanelProps> = ({
  resourceRuntime,
  humanRequest,
}) => {
  if (!resourceRuntime || resourceRuntime.assignments.length === 0) {
    return null;
  }

  return (
    <Card
      size="small"
      style={{
        borderRadius: 18,
        border: "1px solid #dbeafe",
        background: "#f8fbff",
        boxShadow: "0 8px 20px rgba(37, 99, 235, 0.06)",
      }}
      bodyStyle={{ padding: "14px 16px" }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center" gap={12}>
          <Space align="center" size={8}>
            <ApartmentOutlined style={{ color: "#2563eb" }} />
            <Text strong style={{ color: "#1e3a8a" }}>
              沙盒资源占用
            </Text>
          </Space>
          <Tag color="processing" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
            group {resourceRuntime.groupId ?? "pending"}
          </Tag>
        </Flex>

        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {resourceRuntime.assignments.map((assignment) => (
            <Card
              key={`${assignment.nodeId}-${assignment.tabId}`}
              size="small"
              style={{
                borderRadius: 14,
                border: "1px solid #bfdbfe",
                background: "#ffffff",
              }}
              bodyStyle={{ padding: "10px 12px" }}
            >
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Flex justify="space-between" align="center" gap={8}>
                  <Text strong style={{ color: "#111827" }}>
                    {assignment.nodeId}
                  </Text>
                  <Tag color="blue" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                    tab {assignment.tabId}
                  </Tag>
                </Flex>
                <Flex align="center" gap={6}>
                  <LinkOutlined style={{ color: "#64748b", fontSize: 12 }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {simplifyUrl(assignment.url)}
                  </Text>
                </Flex>
              </Space>
            </Card>
          ))}
        </Space>

        {humanRequest ? (
          <Text type="warning" style={{ fontSize: 12 }}>
            当前存在人工接管请求，插件会优先高亮对应的隔离标签页。
          </Text>
        ) : null}
      </Space>
    </Card>
  );
};

