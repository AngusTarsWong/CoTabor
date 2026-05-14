import React from "react";
import { AlertProps, TagProps } from "antd";
import { TFunction } from "i18next";
import { IntegrationStatus } from "../../../../shared/storage/integration-status";

export type StatusTone = "success" | "warning" | "error";

export function getMemoryStatus(status: IntegrationStatus, t: TFunction): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.activeMemoryBackend === "notion") {
    return {
      tone: "success",
      label: t('health.memory.connectedNotion'),
      detail: t('health.memory.connectedDetail'),
    };
  }

  if (status.notion.authorized) {
    return {
      tone: "warning",
      label: t('health.memory.authorizedLabel'),
      detail: t('health.memory.authorizedDetail'),
    };
  }

  return {
    tone: "warning",
    label: t('health.memory.unconfiguredLabel'),
    detail: t('health.memory.unconfiguredDetail'),
  };
}

export function getModelStatus(status: IntegrationStatus, t: TFunction): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.llm.configured) {
    return {
      tone: "success",
      label: t('health.model.configuredLabel'),
      detail: t('health.model.configuredDetail'),
    };
  }

  return {
    tone: "error",
    label: t('health.model.defaultLabel'),
    detail: t('health.model.defaultDetail'),
  };
}

export function getMcpStatus(status: IntegrationStatus, t: TFunction): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.mcp.enabledCount > 0) {
    return {
      tone: "success",
      label: t('health.mcp.availableLabel', { count: status.mcp.enabledCount }),
      detail: t('health.mcp.availableDetail'),
    };
  }

  return {
    tone: "warning",
    label: t('health.mcp.noneLabel'),
    detail: t('health.mcp.noneDetail'),
  };
}

export function getSkillStatus(status: IntegrationStatus, t: TFunction): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (status.skills.loadedCount > 0) {
    return {
      tone: "success",
      label: t('health.skill.loadedLabel', { count: status.skills.loadedCount }),
      detail: t('health.skill.loadedDetail'),
    };
  }

  return {
    tone: "warning",
    label: t('health.skill.noneLabel'),
    detail: t('health.skill.noneDetail'),
  };
}

export function getPageStatus(currentTabTitle: string | undefined, t: TFunction): {
  tone: StatusTone;
  label: string;
  detail: string;
} {
  if (currentTabTitle) {
    return {
      tone: "success",
      label: t('health.page.gotLabel'),
      detail: currentTabTitle,
    };
  }

  return {
    tone: "error",
    label: t('health.page.noLabel'),
    detail: t('health.page.noDetail'),
  };
}

export function getHealthSummary(
  status: IntegrationStatus,
  currentTabTitle: string | undefined,
  t: TFunction
): Pick<AlertProps, "type" | "message" | "description"> {
  const pageReady = !!currentTabTitle;
  const memoryReady = !!status.activeMemoryBackend;
  const modelReady = status.llm.configured;
  const enhancedReady = status.mcp.enabledCount > 0 || status.skills.loadedCount > 0;

  if (!pageReady) {
    return {
      type: "error",
      message: t('summary.errorMessage'),
      description: t('summary.errorDescription'),
    };
  }

  if (!modelReady) {
    return {
      type: "error",
      message: t('summary.warningMessage'),
      description: t('summary.warningDescription'),
    };
  }

  if (memoryReady && (modelReady || enhancedReady)) {
    return {
      type: "success",
      message: t('summary.successMessage'),
      description: t('summary.successDescription'),
    };
  }

  return {
    type: "warning",
    message: t('summary.warningMessage'),
    description: t('summary.warningDescription'),
  };
}

export function getTagColor(tone: StatusTone): TagProps["color"] {
  if (tone === "success") return "success";
  if (tone === "error") return "error";
  return "warning";
}
