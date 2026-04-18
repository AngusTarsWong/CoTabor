import React, { useEffect } from "react";
import { XProvider } from "@ant-design/x";
import { message, Modal, Space, Button } from "antd";
import { ExclamationCircleFilled } from '@ant-design/icons';
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
import { useMemorySync } from "./hooks/useMemorySync";

const SIDEPANEL_VERSION = "debug-2026.03.26-05-modern-ui";

const App: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [tabSwitchModalVisible, setTabSwitchModalVisible] = React.useState(false);
  const [pendingGoal, setPendingGoal] = React.useState("");

  const {
    logs,
    workflowNodes,
    logsEndRef,
    streamTotalTokensRef,
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    clearLogs,
  } = useAppLogs();

  const {
    tabId,
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    activeTabTitle,
    activeTabUrl,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
    softBindPage,
  } = useTabManager(addLog);

  const { triggerMemorySync } = useMemorySync();

  const {
    agentGoal,
    setAgentGoal,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    stopConfirmOpen,
    handleStartAgent: originalHandleStartAgent,
    handleStopAgent,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse
  } = useAgentControl(
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    resolveTargetTabId,
    streamTotalTokensRef,
    triggerMemorySync
  );

  const { showDebugLogs } = useUiPreferences();
  const integrationStatus = useIntegrationStatus();

  const isIdle = logs.length === 0 && !isAgentRunning && !isAgentStopping;

  useEffect(() => {
    const syncIdleBoundTab = async () => {
      if (!isIdle) return;

      if (!tabId) return;

      try {
        const activeTab = await chrome.tabs.get(tabId);
        const nextUrl = activeTab.url ?? "";
        const shouldSoftBind =
          activeTab.id !== boundTabId ||
          nextUrl !== boundTabUrl;

        if (shouldSoftBind) {
          await softBindPage(activeTab);
        }
      } catch (error) {
        console.warn("[App] Failed to sync active tab immediately:", error);
      }
    };

    syncIdleBoundTab().catch(() => {});

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncIdleBoundTab().catch(() => {});
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIdle, tabId, activeTabUrl, boundTabId, boundTabUrl]);

  const wrappedHandleStartAgent = async (goalOverride?: string) => {
    const goal = goalOverride ?? agentGoal;
    if (!goal.trim()) return;

    if (!isIdle && tabId && boundTabId && tabId !== boundTabId) {
      setPendingGoal(goal);
      setTabSwitchModalVisible(true);
      return;
    }

    originalHandleStartAgent(goal);
  };

  useEffect(() => {
    loadDynamicConfig().catch(e => console.warn('[Sidepanel] Failed to load dynamic config:', e));
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
      {contextHolder}
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", backgroundColor: "#f9fafb", overflow: "hidden" }}>
      <Header 
        boundTabId={boundTabId} 
        boundTabTitle={boundTabTitle}
        boundTabUrl={boundTabUrl}
        openOptions={openOptions} 
        onBindCurrentPage={bindCurrentPage}
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
        handleStartAgent={wrappedHandleStartAgent}
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

      <Modal
        title={
          <Space>
            <ExclamationCircleFilled style={{ color: '#faad14' }} />
            检测到页面已切换
          </Space>
        }
        open={tabSwitchModalVisible}
        onCancel={() => setTabSwitchModalVisible(false)}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={340}
      >
        <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 20 }}>
          您正在新页面上发起指令，但之前的对话上下文绑定在旧页面。
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Button 
            block 
            size="large"
            onClick={() => {
              setTabSwitchModalVisible(false);
              originalHandleStartAgent(pendingGoal);
            }}
          >
            基于旧页面继续执行
          </Button>
          <Button 
            block 
            type="primary"
            size="large"
            onClick={() => {
              setTabSwitchModalVisible(false);
              clearLogs();
              if (tabId) {
                chrome.tabs.get(tabId).then(async tab => {
                  await softBindPage(tab);
                  setTimeout(() => {
                    originalHandleStartAgent(pendingGoal);
                  }, 100);
                });
              }
            }}
          >
            在新页面上重新开始
          </Button>
          <Button 
            block 
            type="text"
            onClick={() => {
              setTabSwitchModalVisible(false);
              setPendingGoal("");
            }}
          >
            取消
          </Button>
        </Space>
      </Modal>

    </div>
    </XProvider>
  );
};

export default App;
