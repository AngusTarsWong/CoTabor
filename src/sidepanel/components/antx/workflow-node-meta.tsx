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

export function getSemanticNode(nodeName: string, t: (key: string) => string) {
  const workflowSemanticNodeMap: Record<string, { label: string; icon: React.ReactNode }> = {
    planner: { label: t('nodeMeta.planner'), icon: <BulbOutlined /> },
    dag_launch_planner: { label: t('nodeMeta.dagPlanner'), icon: <PartitionOutlined /> },
    cortex: { label: t('nodeMeta.cortex'), icon: <EyeOutlined /> },
    cortex_planner_executor: { label: t('nodeMeta.cortexExecutor'), icon: <ToolOutlined /> },
    cortex_evaluator: { label: t('nodeMeta.cortexEvaluator'), icon: <SearchOutlined /> },
    watchdog: { label: t('nodeMeta.watchdog'), icon: <SafetyCertificateOutlined /> },
    experience_job: { label: t('nodeMeta.experience'), icon: <SaveOutlined /> },
    replanner: { label: t('nodeMeta.replanner'), icon: <SyncOutlined /> },
    executor: { label: t('nodeMeta.executor'), icon: <ThunderboltOutlined /> },
    human: { label: t('nodeMeta.human'), icon: <UserOutlined /> },
  };

  if (nodeName.startsWith("dag_launch_planner_")) {
    return { label: t('nodeMeta.dagSubtask'), icon: <PartitionOutlined /> };
  }
  return workflowSemanticNodeMap[nodeName] || { label: nodeName, icon: <RobotOutlined /> };
}
