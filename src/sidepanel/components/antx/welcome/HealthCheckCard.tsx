import React from "react";
import { Button, Col, Flex, Row, Space, Tag, Typography, Collapse } from "antd";
import {
  CloudServerOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ToolOutlined,
  CheckCircleFilled,
  WarningFilled
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
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

export const HealthCheckCard: React.FC<HealthCheckCardProps> = ({
  integrationStatus,
  currentTabTitle,
  openOptions,
}) => {
  const { t } = useTranslation('welcome');

  const memory = getMemoryStatus(integrationStatus, t);
  const model = getModelStatus(integrationStatus, t);
  const mcp = getMcpStatus(integrationStatus, t);
  const skill = getSkillStatus(integrationStatus, t);
  const page = getPageStatus(currentTabTitle, t);

  const items: CheckItem[] = [
    { key: "memory", icon: <CloudServerOutlined />, name: t('health.items.memory'), ...memory },
    { key: "model",  icon: <RobotOutlined />,         name: t('health.items.model'),  ...model  },
    { key: "mcp",    icon: <ToolOutlined />,           name: t('health.items.mcp'),    ...mcp    },
    { key: "skill",  icon: <SafetyCertificateOutlined />, name: t('health.items.skill'), ...skill },
    { key: "page",   icon: <LinkOutlined />,           name: t('health.items.page'),   ...page   },
  ];

  const getStateMeta = (tone: CheckItem["tone"]) => {
    if (tone === "error")   return { label: t('common:status.needsAttention'), color: "error" as const };
    if (tone === "warning") return { label: t('common:status.canOptimize'),    color: "warning" as const };
    return                         { label: t('common:status.normal'),         color: "success" as const };
  };

  const hasErrorOrWarning = items.some(item => item.tone !== "success");

  return (
    <Collapse
      ghost
      defaultActiveKey={hasErrorOrWarning ? ["health"] : []}
      items={[
        {
          key: "health",
          label: (
            <Space>
              <Text strong>{t('health.title')}</Text>
              {hasErrorOrWarning ? (
                <Tag icon={<WarningFilled />} color="warning">{t('health.status.abnormal')}</Tag>
              ) : (
                <Tag icon={<CheckCircleFilled />} color="success">{t('health.status.healthy')}</Tag>
              )}
            </Space>
          ),
          extra: (
            <Button
              type="link"
              size="small"
              icon={<SettingOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openOptions();
              }}
              style={{ paddingInline: 0, height: 22 }}
            >
              {t('health.settings')}
            </Button>
          ),
          children: (
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
          )
        }
      ]}
    />
  );
};
