import React from "react";
import { Space } from "antd";
import { IntegrationStatus } from "../../../shared/storage/integration-status";
import { CapabilityIntroCard } from "./welcome/CapabilityIntroCard";
import { HealthCheckCard } from "./welcome/HealthCheckCard";
import { HealthSummaryAlert } from "./welcome/HealthSummaryAlert";

interface CotaborWelcomeProps {
  setAgentGoal: (goal: string) => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
}

export const CotaborWelcome: React.FC<CotaborWelcomeProps> = ({
  setAgentGoal,
  integrationStatus,
  openOptions,
  currentTabTitle,
}) => {
  return (
    <div style={{ margin: "0 auto", width: "100%", maxWidth: 520, paddingBottom: 12 }}>
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <HealthSummaryAlert
          integrationStatus={integrationStatus}
          currentTabTitle={currentTabTitle}
        />

        <HealthCheckCard
          integrationStatus={integrationStatus}
          currentTabTitle={currentTabTitle}
          openOptions={openOptions}
        />

        <CapabilityIntroCard onSelectTask={setAgentGoal} />
      </Space>
    </div>
  );
};
