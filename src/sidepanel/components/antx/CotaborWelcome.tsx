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
  agentMode?: string;
}

const TypewriterTitle: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = React.useState("");
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text.charAt(index));
        setIndex(index + 1);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [index, text]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {displayedText}
      <span
        style={{
          display: index < text.length ? "inline-block" : "none",
          width: 4,
          height: "1em",
          background: "#1677ff",
          marginLeft: 4,
          animation: "blink 1s step-end infinite",
        }}
      />
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}
      </style>
    </span>
  );
};

export const CotaborWelcome: React.FC<CotaborWelcomeProps> = ({
  setAgentGoal,
  integrationStatus,
  openOptions,
  currentTabTitle,
  agentMode,
}) => {

  return (
    <div style={{ margin: "0 auto", width: "100%", maxWidth: 520, paddingBottom: 12 }}>
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <Welcome
          variant="borderless"
          icon={<RobotOutlined style={{ fontSize: 32, color: '#1677ff' }} />}
          title={<TypewriterTitle text="你好，我是 CoTabor" />}
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

        <CapabilityIntroCard onSelectTask={setAgentGoal} agentMode={agentMode} />
      </Space>
    </div>
  );
};
