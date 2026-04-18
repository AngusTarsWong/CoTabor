import React from "react";
import { Alert } from "antd";
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
  const summary = getHealthSummary(integrationStatus, currentTabTitle);

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
