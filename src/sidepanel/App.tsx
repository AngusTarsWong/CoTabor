import React, { useEffect } from "react";
import { skillRegistry } from "../skills/registry";
import { Header } from "./components/Header";
import { DebugDrawer } from "./components/DebugDrawer";
import { ChatArea } from "./components/ChatArea";
import { HumanInTheLoopUI } from "./components/HumanInTheLoopUI";
import { InputArea } from "./components/InputArea";
import { loadDynamicConfig } from "../shared/constants/env";

// Custom hooks for modular logic
import { useAppLogs } from "./hooks/useAppLogs";
import { useTabManager } from "./hooks/useTabManager";
import { useAgentControl } from "./hooks/useAgentControl";
import { useDebugTools } from "./hooks/useDebugTools";

const SIDEPANEL_VERSION = "debug-2026.03.26-05-modern-ui";

const App: React.FC = () => {
  const {
    logs,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    addAgentLogs,
    handleToggleStep
  } = useAppLogs();

  const {
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
  } = useTabManager(addLog);

  const {
    agentGoal,
    setAgentGoal,
    isAgentRunning,
    humanRequest,
    runtimeStats,
    handleStartAgent,
    handleStopAgent,
    handleHumanResponse
  } = useAgentControl(addLog, addAgentLogs, resolveTargetTabId, streamTotalTokensRef);

  const {
    showDebug,
    setShowDebug,
    activeDebugTab,
    setActiveDebugTab,
    skillTestLog,
    targetId,
    setTargetId,
    inputText,
    setInputText,
    handleAttach,
    handleDetach,
    handleScan,
    handleClick,
    handleType,
    testFeishuApi,
    testVectorization
  } = useDebugTools(resolveTargetTabId);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", backgroundColor: "#f9fafb" }}>
      <Header 
        boundTabId={boundTabId} 
        boundTabTitle={boundTabTitle}
        boundTabUrl={boundTabUrl}
        showDebug={showDebug} 
        setShowDebug={setShowDebug} 
        openOptions={openOptions} 
        onBindCurrentPage={bindCurrentPage}
      />

      {showDebug && (
        <DebugDrawer 
          version={SIDEPANEL_VERSION}
          activeDebugTab={activeDebugTab}
          setActiveDebugTab={setActiveDebugTab}
          boundTabUrl={boundTabUrl}
          handleBindCurrentPage={handleBindCurrentPage}
          handleAttach={handleAttach}
          handleDetach={handleDetach}
          handleScan={handleScan}
          targetId={targetId}
          setTargetId={setTargetId}
          handleClick={handleClick}
          inputText={inputText}
          setInputText={setInputText}
          handleType={handleType}
          testFeishuApi={testFeishuApi}
          testVectorization={testVectorization}
          skillTestLog={skillTestLog}
        />
      )}

      <ChatArea
        logs={logs}
        isAgentRunning={isAgentRunning}
        hasHumanRequest={!!humanRequest}
        setAgentGoal={setAgentGoal}
        logsEndRef={logsEndRef}
        runtimeStats={runtimeStats}
        onToggleStep={handleToggleStep}
      />

      <HumanInTheLoopUI 
        humanRequest={humanRequest}
        handleHumanResponse={handleHumanResponse}
      />

      <InputArea 
        agentGoal={agentGoal}
        setAgentGoal={setAgentGoal}
        isAgentRunning={isAgentRunning}
        handleStartAgent={handleStartAgent}
        handleStopAgent={handleStopAgent}
      />
    </div>
  );
};

export default App;
