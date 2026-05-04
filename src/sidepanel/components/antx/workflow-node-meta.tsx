import React from "react";
import {
  BulbOutlined,
  EyeOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";

export const workflowSemanticNodeMap: Record<string, { label: string; icon: React.ReactNode }> = {
  planner: { label: "规划下一步", icon: <BulbOutlined /> },
  cortex: { label: "观察页面状态", icon: <EyeOutlined /> },
  cortex_planner_executor: { label: "尝试恢复操作", icon: <ToolOutlined /> },
  cortex_evaluator: { label: "判断恢复结果", icon: <SearchOutlined /> },
  watchdog: { label: "检查是否完成", icon: <SafetyCertificateOutlined /> },
  memory: { label: "检索相关经验", icon: <ReadOutlined /> },
  experience: { label: "沉淀本次经验", icon: <ThunderboltOutlined /> },
  experience_job: { label: "后台沉淀经验", icon: <SaveOutlined /> },
  replanner: { label: "调整执行方案", icon: <SyncOutlined /> },
  executor: { label: "执行目标", icon: <ThunderboltOutlined /> },
  human: { label: "等待人工协助", icon: <UserOutlined /> },
};

export function getSemanticNode(nodeName: string) {
  return workflowSemanticNodeMap[nodeName] || { label: nodeName, icon: <RobotOutlined /> };
}
