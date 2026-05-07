import React from "react";
import {
  BulbOutlined,
  EyeOutlined,
  PartitionOutlined,
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
  dag_launch_planner: { label: "拆解 DAG 子任务", icon: <PartitionOutlined /> },
  cortex: { label: "观察页面状态", icon: <EyeOutlined /> },
  cortex_planner_executor: { label: "尝试恢复操作", icon: <ToolOutlined /> },
  cortex_evaluator: { label: "判断恢复结果", icon: <SearchOutlined /> },
  watchdog: { label: "检查是否完成", icon: <SafetyCertificateOutlined /> },
  experience_job: { label: "后台沉淀经验", icon: <SaveOutlined /> },
  replanner: { label: "调整执行方案", icon: <SyncOutlined /> },
  executor: { label: "执行目标", icon: <ThunderboltOutlined /> },
  human: { label: "等待人工协助", icon: <UserOutlined /> },
};

export function getSemanticNode(nodeName: string) {
  if (nodeName.startsWith("dag_launch_planner_")) {
    return { label: "DAG 子任务", icon: <PartitionOutlined /> };
  }
  return workflowSemanticNodeMap[nodeName] || { label: nodeName, icon: <RobotOutlined /> };
}
