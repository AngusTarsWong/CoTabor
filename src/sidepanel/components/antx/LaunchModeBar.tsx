import React from "react";
import { useTranslation } from "react-i18next";
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
  chrome.tabs.create({ url, active: false }).catch(() => {});
}

export const LaunchModeBar: React.FC<LaunchModeBarProps> = ({
  mode,
  onModeChange,
  onInsertDagExample,
  disabled = false,
}) => {
  const { t } = useTranslation('sidepanel');
  const options = [
    { value: "single", label: t('launchMode.single.label'), icon: <BlockOutlined />, tooltip: t('launchMode.single.tooltip') },
    { value: "auto", label: t('launchMode.auto.label'), icon: <RobotOutlined />, tooltip: t('launchMode.auto.tooltip') },
    { value: "dag", label: t('launchMode.dag.label'), icon: <PartitionOutlined />, tooltip: t('launchMode.dag.tooltip') },
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
