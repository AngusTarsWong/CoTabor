import React from "react";
import { AlertProps, TagProps } from "antd";
import { IntegrationStatus } from "../../../../shared/storage/integration-status";

export type StatusTone = "success" | "warning" | "error";

export function getMemoryStatus(status: IntegrationStatus): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.activeMemoryBackend === "notion") {
    return {
      tone: "success",
      label: "已连接 · Notion",
      detail: "跨设备记忆能力可用",
    };
  }

  if (status.activeMemoryBackend === "feishu") {
    return {
      tone: "success",
      label: "已连接 · 飞书",
      detail: "跨设备记忆能力可用",
    };
  }

  if (status.notion.authorized || status.feishu.authorized) {
    return {
      tone: "warning",
      label: "已授权，未启用",
      detail: "记忆后端已接入但尚未处于使用状态",
    };
  }

  return {
    tone: "warning",
    label: "未配置",
    detail: "当前仅能使用本地临时上下文",
  };
}

export function getModelStatus(status: IntegrationStatus): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.llm.configured) {
    return {
      tone: "success",
      label: "已配置",
      detail: "当前使用自定义模型配置",
    };
  }

  return {
    tone: "warning",
    label: "默认模型",
    detail: "未单独配置，任务仍可继续执行",
  };
}

export function getMcpStatus(status: IntegrationStatus): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.mcp.enabledCount > 0) {
    return {
      tone: "success",
      label: `${status.mcp.enabledCount} 个可用`,
      detail: "外部工具能力已启用",
    };
  }

  return {
    tone: "warning",
    label: "0 个可用",
    detail: "未启用扩展工具，不影响基础任务",
  };
}

export function getSkillStatus(status: IntegrationStatus): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.skills.loadedCount > 0) {
    return {
      tone: "success",
      label: `${status.skills.loadedCount} 个已加载`,
      detail: "可支持更多场景化任务",
    };
  }

  return {
    tone: "warning",
    label: "0 个已加载",
    detail: "未加载额外技能，不影响直接开始",
  };
}

export function getPageStatus(currentTabTitle?: string): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (currentTabTitle) {
    return {
      tone: "success",
      label: "已获取当前页面",
      detail: currentTabTitle,
    };
  }

  return {
    tone: "error",
    label: "未获取页面上下文",
    detail: "请确认当前标签页可访问后再开始任务",
  };
}

export function getHealthSummary(
  status: IntegrationStatus,
  currentTabTitle?: string
): Pick<AlertProps, "type" | "message" | "description"> {
  const pageReady = !!currentTabTitle;
  const memoryReady = !!status.activeMemoryBackend;
  const modelReady = status.llm.configured;
  const enhancedReady = status.mcp.enabledCount > 0 || status.skills.loadedCount > 0;

  if (!pageReady) {
    return {
      type: "error",
      message: "当前环境检测异常",
      description: "未获取到当前页面上下文，开始任务前请先确认可访问的页面标签。",
    };
  }

  if (memoryReady && (modelReady || enhancedReady)) {
    return {
      type: "success",
      message: "当前插件运行正常",
      description: "核心能力已联通，可以直接输入任务开始执行。",
    };
  }

  return {
    type: "warning",
    message: "部分增强能力未启用",
    description: "基础能力可直接使用，未配置项只会影响复杂任务效果。",
  };
}

export function getTagColor(tone: StatusTone): TagProps["color"] {
  if (tone === "success") return "success";
  if (tone === "error") return "error";
  return "warning";
}
