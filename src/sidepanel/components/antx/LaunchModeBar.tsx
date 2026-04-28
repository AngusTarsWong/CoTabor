import React from "react";
import { Button, Flex, Segmented, Tag, Typography } from "antd";
import type { SidepanelLaunchMode } from "../../types/launch-mode";

const { Text } = Typography;

interface LaunchModeBarProps {
  mode: SidepanelLaunchMode;
  onModeChange: (mode: SidepanelLaunchMode) => void;
  onInsertDagExample: () => void;
  disabled?: boolean;
}

export const LaunchModeBar: React.FC<LaunchModeBarProps> = ({
  mode,
  onModeChange,
  onInsertDagExample,
  disabled = false,
}) => {
  return (
    <Flex vertical gap={8} style={{ padding: "8px 8px 0" }}>
      <Flex justify="space-between" align="center" gap={8}>
        <Segmented
          size="middle"
          disabled={disabled}
          value={mode}
          onChange={(value) => onModeChange(value as SidepanelLaunchMode)}
          options={[
            { label: "单任务", value: "single" },
            { label: "DAG 执行", value: "dag" },
          ]}
        />
        {mode === "dag" ? (
          <Button size="small" type="link" disabled={disabled} onClick={onInsertDagExample}>
            插入示例
          </Button>
        ) : null}
      </Flex>
      <Flex align="center" gap={8}>
        <Tag color={mode === "dag" ? "processing" : "default"} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
          {mode === "dag" ? "自动规划" : "自然语言"}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {mode === "dag"
            ? "DAG 模式下直接输入任务目标，系统会自动规划 DAG；内部仍支持 shared_tab、single_page_serial、isolated_tabs。"
            : "单任务模式下直接输入目标即可。"}
        </Text>
      </Flex>
    </Flex>
  );
};
