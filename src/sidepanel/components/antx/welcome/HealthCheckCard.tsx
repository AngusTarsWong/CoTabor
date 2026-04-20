import React from "react";
import { Button, Card, Col, Flex, Row, Space, Tag, Typography } from "antd";
import {
  CloudServerOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { IntegrationStatus } from "../../../../shared/storage/integration-status";
import {
  getMemoryStatus,
  getMcpStatus,
  getModelStatus,
  getPageStatus,
  getSkillStatus,
  getTagColor,
} from "./status";

const { Text } = Typography;

interface HealthCheckCardProps {
  integrationStatus: IntegrationStatus;
  currentTabTitle?: string;
  openOptions: () => void;
}

type CheckItem = {
  key: string;
  icon: React.ReactNode;
  name: string;
  tone: "success" | "warning" | "error";
  label: string;
  detail: string;
};

const getStateMeta = (tone: CheckItem["tone"]) => {
  if (tone === "error") {
    return { label: "需处理", color: "error" as const };
  }
  if (tone === "warning") {
    return { label: "可优化", color: "warning" as const };
  }
  return { label: "正常", color: "success" as const };
};

export const HealthCheckCard: React.FC<HealthCheckCardProps> = ({
  integrationStatus,
  currentTabTitle,
  openOptions,
}) => {
  const memory = getMemoryStatus(integrationStatus);
  const model = getModelStatus(integrationStatus);
  const mcp = getMcpStatus(integrationStatus);
  const skill = getSkillStatus(integrationStatus);
  const page = getPageStatus(currentTabTitle);

  const items: CheckItem[] = [
    {
      key: "memory",
      icon: <CloudServerOutlined />,
      name: "记忆库",
      ...memory,
    },
    {
      key: "model",
      icon: <RobotOutlined />,
      name: "大模型",
      ...model,
    },
    {
      key: "mcp",
      icon: <ToolOutlined />,
      name: "MCP 工具",
      ...mcp,
    },
    {
      key: "skill",
      icon: <SafetyCertificateOutlined />,
      name: "Skill 能力",
      ...skill,
    },
    {
      key: "page",
      icon: <LinkOutlined />,
      name: "当前页面",
      ...page,
    },
  ];

  return (
    <Card
      title="环境检测"
      extra={
        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={openOptions}
          style={{ paddingInline: 0 }}
        >
          设置
        </Button>
      }
      style={{ borderRadius: 20, boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)" }}
      styles={{ body: { padding: 12 } }}
    >
      <Row gutter={[10, 10]}>
        {items.map((item) => {
          const stateMeta = getStateMeta(item.tone);

          return (
            <Col key={item.key} span={item.key === "page" ? 24 : 12}>
              <Flex
                vertical
                gap={10}
                style={{
                  height: "100%",
                  padding: "12px",
                  borderRadius: 16,
                  border: "1px solid #eef2f7",
                  background: "#ffffff",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
                }}
              >
                <Flex vertical gap={8} style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f5f8ff",
                        color: "#2563eb",
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <Text strong style={{ color: "#172033", fontSize: 14, lineHeight: 1.35 }}>
                      {item.name}
                    </Text>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <Tag
                      color={getTagColor(item.tone)}
                      style={{
                        marginInlineEnd: 0,
                        borderRadius: 999,
                        width: "fit-content",
                        fontSize: 12,
                        lineHeight: "20px",
                        paddingInline: 8,
                      }}
                    >
                      {item.label}
                    </Tag>
                    <Tag
                      color={stateMeta.color}
                      style={{
                        marginInlineEnd: 0,
                        borderRadius: 999,
                        width: "fit-content",
                        fontSize: 12,
                        lineHeight: "20px",
                        paddingInline: 8,
                      }}
                    >
                      {stateMeta.label}
                    </Tag>
                  </div>
                </Flex>

                <div style={{ minHeight: item.key === "page" ? "auto" : 34 }}>
                  <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.45 }}>
                    {item.detail}
                  </Text>
                </div>
              </Flex>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
};
