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
            { label: "智能调度", value: "auto" },
            { label: "单兵模式", value: "single" },
            { label: "蜂群模式", value: "dag" },
          ]}
        />
        {mode === "dag" ? (
          <Button size="small" type="link" disabled={disabled} onClick={onInsertDagExample}>
            插入示例
          </Button>
        ) : null}
      </Flex>
      <Flex align="center" gap={8}>
        <Tag color={mode === "dag" ? "processing" : mode === "auto" ? "purple" : "default"} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
          {mode === "dag" ? "强制多 Agent" : mode === "auto" ? "自动识别" : "强制单页"}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {mode === "dag"
            ? "强行出动蜂群。系统会自动拆解目标并分发给多个 Agent 协同完成。"
            : mode === "auto"
            ? "系统会根据任务复杂度自动决定是否召唤蜂群。"
            : "单兵作战，仅在当前所在页面执行操作。"}
        </Text>
      </Flex>
    </Flex>
  );
};
