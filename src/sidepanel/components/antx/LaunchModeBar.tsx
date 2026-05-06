import React from "react";
import { Select, Tooltip, Space } from "antd";
import { BlockOutlined, PartitionOutlined, RobotOutlined } from "@ant-design/icons";
import type { SidepanelLaunchMode } from "../../types/launch-mode";

interface LaunchModeBarProps {
  mode: SidepanelLaunchMode;
  onModeChange: (mode: SidepanelLaunchMode) => void;
  onInsertDagExample: () => void;
  disabled?: boolean;
}

function openSwarmCockpit() {
  const url = chrome.runtime.getURL("swarm.html");
  chrome.tabs.create({ url, active: true }).catch(() => {});
}

export const LaunchModeBar: React.FC<LaunchModeBarProps> = ({
  mode,
  onModeChange,
  onInsertDagExample,
  disabled = false,
}) => {
  const options = [
    { value: "single", label: "单兵模式", icon: <BlockOutlined />, tooltip: "单兵作战，仅在当前所在页面执行操作。" },
    { value: "auto", label: "智能调度", icon: <RobotOutlined />, tooltip: "系统会自动拆解目标并分发给多个 Agent 协同完成。" },
    { value: "dag", label: "蜂群模式", icon: <PartitionOutlined />, tooltip: "多 Agent 并发，在独立标签页完成复杂跨页任务。" },
  ];

  const currentOption = options.find((o) => o.value === mode);

  return (
    <Tooltip title={currentOption?.tooltip} placement="topLeft">
      <Select
        variant="borderless"
        value={mode}
        disabled={disabled}
        onChange={(value: SidepanelLaunchMode) => {
          onModeChange(value);
          if (value === 'dag') {
            openSwarmCockpit();
          }
        }}
        dropdownMatchSelectWidth={false}
        style={{ width: 110 }}
        optionLabelProp="label"
        options={options.map(opt => ({
          ...opt,
          label: (
            <Space size={4}>
              {opt.icon}
              <span style={{ fontSize: 13 }}>{opt.label}</span>
            </Space>
          )
        }))}
      />
    </Tooltip>
  );
};
