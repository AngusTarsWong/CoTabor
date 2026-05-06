import React, { useEffect } from "react";
import { XProvider } from "@ant-design/x";
import { ConfigProvider, message, Modal, Space, Button } from "antd";
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import enUS from 'antd/locale/en_US';
import { findLanguage } from '../i18n/languages';
import { Header } from "./components/Header";
import { HumanInTheLoopUI } from "./components/HumanInTheLoopUI";
import { StopConfirmModal } from "./components/StopConfirmModal";
import { ChatWorkspace } from "./components/antx/ChatWorkspace";
import { loadDynamicConfig } from "../shared/constants/env";

// Custom hooks for modular logic
import { useAppLogs } from "./hooks/useAppLogs";
import { useTabManager } from "./hooks/useTabManager";
import { useAgentControl } from "./hooks/useAgentControl";
import { useIntegrationStatus } from "./hooks/useIntegrationStatus";
import { useMemorySync } from "./hooks/useMemorySync";
import { useSidepanelSessionSnapshot } from "./hooks/useSidepanelSessionSnapshot";

declare const __APP_VERSION__: string;
const SIDEPANEL_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const App: React.FC = () => {
  const { i18n, t } = useTranslation('sidepanel');
  const antdLocale = findLanguage(i18n.language)?.antdLocale ?? enUS;
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
    restoreLogsSnapshot,
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
    restoreBoundPageSnapshot,
  } = useTabManager(addLog);

  const { triggerMemorySync } = useMemorySync();

  const {
    agentGoal,
    setAgentGoal,
    experienceUiState,
    resourceRuntime,
    dagReplayTargets,
    dagBranchReplayTargets,
    replayLoadingKey,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    isClassifyingIntent,
    pendingAutoLaunchRequest,
    stopConfirmOpen,
    handleStartAgent: originalHandleStartAgent,
    handleConfirmAutoLaunch,
    handleCancelAutoLaunch,
    handleStopAgent,
    handleReplayDagNode,
    handleReplayDagBranch,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse
  } = useAgentControl(
    addLog,
    beginWorkflowRun,
    recordWorkflowStep,
    resolveTargetTabId,
    streamTotalTokensRef,
    triggerMemorySync,
    (newTabId: number) => {
      chrome.tabs.get(newTabId).then((tab) => softBindPage(tab)).catch(() => {});
    }
  );

  const integrationStatus = useIntegrationStatus();

  const isIdle = logs.length === 0 && !isAgentRunning && !isAgentStopping;

  const {
    snapshot: sessionSnapshot,
    summary: sessionSnapshotSummary,
    clearSnapshot: clearSessionSnapshot,
  } = useSidepanelSessionSnapshot({
    logs,
    workflowNodes,
    agentGoal,
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    isAgentRunning,
    isAgentStopping,
  });

  const handleRestoreSessionSnapshot = async () => {
    if (!sessionSnapshot) return;
    restoreLogsSnapshot({
      logs: sessionSnapshot.logs,
      workflowNodes: sessionSnapshot.workflowNodes,
    });
    setAgentGoal(sessionSnapshot.agentGoal || "");
    await restoreBoundPageSnapshot({
      boundTabId: sessionSnapshot.boundTabId,
      boundTabTitle: sessionSnapshot.boundTabTitle,
      boundTabUrl: sessionSnapshot.boundTabUrl,
    });
    if (sessionSnapshot.wasRunning || sessionSnapshot.wasStopping) {
      addLog(
        'system',
        '已恢复上次界面记录。上次关闭时任务仍在进行中，当前不会恢复后台执行，请重新发起任务继续。',
        false,
        false,
        { displayStyle: 'inline-status' },
      );
    }
  };

  const handleDiscardSessionSnapshot = async () => {
    await clearSessionSnapshot();
  };

  const clearCurrentSession = () => {
    clearLogs();
    clearSessionSnapshot().catch(() => {});
  };

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

  useEffect(() => {
    chrome.storage.local.set({ swarmWorkflowNodes: workflowNodes }).catch(() => {});
  }, [workflowNodes]);

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

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes.llmConfig) return;
      loadDynamicConfig().catch(e => console.warn('[Sidepanel] Failed to sync llmConfig after storage change:', e));
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  };

  return (
    <ConfigProvider locale={antdLocale}>
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
        isAgentRunning={isAgentRunning}
        isAgentStopping={isAgentStopping}
        hasHumanRequest={!!humanRequest}
        humanRequest={humanRequest}
        agentGoal={agentGoal}
        setAgentGoal={setAgentGoal}
        experienceUiState={experienceUiState}
        resourceRuntime={resourceRuntime}
        dagReplayTargets={dagReplayTargets}
        dagBranchReplayTargets={dagBranchReplayTargets}
        replayLoadingKey={replayLoadingKey}
        logsEndRef={logsEndRef}
        runtimeStats={runtimeStats}
        isClassifyingIntent={isClassifyingIntent}
        pendingAutoLaunchRequest={pendingAutoLaunchRequest}
        handleConfirmAutoLaunch={handleConfirmAutoLaunch}
        handleCancelAutoLaunch={handleCancelAutoLaunch}
        handleStartAgent={wrappedHandleStartAgent}
        handleStopAgent={handleStopAgent}
        handleReplayDagNode={handleReplayDagNode}
        handleReplayDagBranch={handleReplayDagBranch}
        integrationStatus={integrationStatus}
        openOptions={openOptions}
        currentTabTitle={boundTabTitle || activeTabTitle}
        sessionSnapshot={isIdle ? sessionSnapshotSummary : null}
        onRestoreSession={handleRestoreSessionSnapshot}
        onDiscardSession={handleDiscardSessionSnapshot}
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
            {t('modal.tabSwitch.title')}
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
          {t('modal.tabSwitch.body')}
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
            {t('modal.tabSwitch.continueOld')}
          </Button>
          <Button
            block
            type="primary"
            size="large"
            onClick={() => {
              setTabSwitchModalVisible(false);
              clearCurrentSession();
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
            {t('modal.tabSwitch.restartNew')}
          </Button>
          <Button
            block
            type="text"
            onClick={() => {
              setTabSwitchModalVisible(false);
              setPendingGoal("");
            }}
          >
            {t('common:cancel', 'Cancel')}
          </Button>
        </Space>
      </Modal>

    </div>
    </XProvider>
    </ConfigProvider>
  );
};

export default App;
