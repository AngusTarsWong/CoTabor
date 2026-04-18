import React, { useEffect } from "react";
import { XProvider } from "@ant-design/x";
import { skillRegistry } from "../skills/registry";
import { Header } from "./components/Header";
import { HumanInTheLoopUI } from "./components/HumanInTheLoopUI";
import { StopConfirmModal } from "./components/StopConfirmModal";
import { ChatWorkspace } from "./components/antx/ChatWorkspace";
import { loadDynamicConfig } from "../shared/constants/env";

// Custom hooks for modular logic
import { useAppLogs } from "./hooks/useAppLogs";
import { useTabManager } from "./hooks/useTabManager";
import { useAgentControl } from "./hooks/useAgentControl";
import { useUiPreferences } from "./hooks/useUiPreferences";
import { useIntegrationStatus } from "./hooks/useIntegrationStatus";

const SIDEPANEL_VERSION = "debug-2026.03.26-05-modern-ui";

const App: React.FC = () => {
  const {
    logs,
    workflowNodes,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
  } = useAppLogs();

  const {
    tabId,
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    activeTabTitle,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
  } = useTabManager(addLog);

  const {
    agentGoal,
    setAgentGoal,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    stopConfirmOpen,
    handleStartAgent,
    handleStopAgent,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse
  } = useAgentControl(
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    resolveTargetTabId,
    streamTotalTokensRef
  );

  const { showDebugLogs } = useUiPreferences();
  const integrationStatus = useIntegrationStatus();

  useEffect(() => {
    loadDynamicConfig().catch(e => console.warn('[Sidepanel] Failed to load dynamic config:', e));
    skillRegistry.loadAll().catch(e =>
      console.warn('[Sidepanel] MCP skill load failed:', e)
    );
  }, []);

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  return (
    <XProvider
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorBgLayout: '#f7f9fc',
          borderRadius: 16,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
      }}
    >
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", backgroundColor: "#f9fafb", overflow: "hidden" }}>
      <Header 
        boundTabId={boundTabId} 
        boundTabTitle={boundTabTitle}
        boundTabUrl={boundTabUrl}
        openOptions={openOptions} 
        onBindCurrentPage={bindCurrentPage}
        integrationStatus={integrationStatus}
      />

      <ChatWorkspace
        logs={logs}
        workflowNodes={workflowNodes}
        showDebugLogs={showDebugLogs}
        isAgentRunning={isAgentRunning}
        isAgentStopping={isAgentStopping}
        hasHumanRequest={!!humanRequest}
        humanRequest={humanRequest}
        agentGoal={agentGoal}
        setAgentGoal={setAgentGoal}
        logsEndRef={logsEndRef}
        runtimeStats={runtimeStats}
        handleStartAgent={handleStartAgent}
        handleStopAgent={handleStopAgent}
        integrationStatus={integrationStatus}
        openOptions={openOptions}
        currentTabTitle={boundTabTitle || activeTabTitle}
      />

      <HumanInTheLoopUI 
        humanRequest={humanRequest}
        handleHumanResponse={handleHumanResponse}
      />

      <StopConfirmModal
        open={stopConfirmOpen}
        onCancel={handleCancelStop}
        onConfirm={handleConfirmStop}
      />
    </div>
    </XProvider>
  );
};

export default App;
