import React from "react";
import { Space } from "antd";
import { Welcome } from "@ant-design/x";
import { RobotOutlined } from "@ant-design/icons";
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
        <Welcome
          variant="borderless"
          icon={<RobotOutlined style={{ fontSize: 32, color: '#1677ff' }} />}
          title="你好，我是 CoTabor"
          description={
            <div style={{ marginTop: 12 }}>
              <HealthSummaryAlert
                integrationStatus={integrationStatus}
                currentTabTitle={currentTabTitle}
              />
            </div>
          }
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
