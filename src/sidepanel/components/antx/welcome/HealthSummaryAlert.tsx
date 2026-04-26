import React from "react";
import { Alert } from "antd";
import { useTranslation } from "react-i18next";
import { IntegrationStatus } from "../../../../shared/storage/integration-status";
import { getHealthSummary } from "./status";

interface HealthSummaryAlertProps {
  integrationStatus: IntegrationStatus;
  currentTabTitle?: string;
}

export const HealthSummaryAlert: React.FC<HealthSummaryAlertProps> = ({
  integrationStatus,
  currentTabTitle,
}) => {
  const { t } = useTranslation('welcome');
  const summary = getHealthSummary(integrationStatus, currentTabTitle, t);

  return (
    <Alert
      type={summary.type}
      message={summary.message}
      description={summary.description}
      showIcon
      style={{ borderRadius: 16 }}
    />
  );
};
