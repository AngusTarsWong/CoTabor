import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { ClawAgent, HumanRequest } from '../../lib/claw';
import { orchestrator } from '../../core/orchestrator/AgentOrchestrator';
import { parseAgentLaunchInput } from '../../core/orchestrator/launch-request';
import { classifyIntent } from '../../core/orchestrator/planning/IntentClassifier';
import { AgentMemoryProvider } from '../../shared/utils/memory/agent-memory';
import { ENV, loadDynamicConfig } from '../../shared/constants/env';
import { cdp } from '../../lib/claw';
import { RuntimeStats } from './useAppLogs';
import { experienceJobEventTarget, ExperienceJobEvent } from '../../memory/experience-job/events';
import { ExperienceUiState } from '../types/experience-ui';
import { buildExperienceSyncDetails } from '../../memory/task-commit/experience-sync-details-builder';
import type { SandboxRuntimeSnapshot } from '../../core/orchestrator/types/ResourceRuntime';
import { ChromeSandboxTabDriver } from '../../core/orchestrator/runtime/ChromeSandboxTabDriver';
import { useTranslation } from 'react-i18next';

const RESTRICTED_PAGE_FALLBACK_URL = "https://www.google.com";

type StartAgentOptions = {
  skipIntentClassification?: boolean;
  forceDagPlanning?: boolean;
  suppressUserLog?: boolean;
};

function isRestrictedStartupUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    url.startsWith("devtools://")
  );
}

async function waitForTabComplete(tabId: number, timeoutMs = 8000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function normalizeTaskId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "task";
}

function buildDagPlanLifecycle(status: "dag_planning" | "dag_ready" | "swarm_starting" | "swarm_running" | "swarm_finished" | "swarm_failed", goal: string, error?: string) {
  return {
    status,
    goal,
    error,
    updatedAt: Date.now(),
  };
}

export function useAgentControl(
  addLog: (
    sender: 'user' | 'agent' | 'system',
    text: string,
    isError?: boolean,
    isSuccess?: boolean,
    options?: { displayStyle?: 'inline-status' }
  ) => void,
  beginWorkflowRun: () => void,
  recordWorkflowStep: (step: any) => void,
  resolveTargetTabId: () => Promise<number | null>,
  streamTotalTokensRef: MutableRefObject<number>,
  triggerMemorySync?: () => Promise<void>,
  onTabSwitch?: (newTabId: number) => void
) {
  const { t } = useTranslation('sidepanel');
  const [agentGoal, setAgentGoal] = useState<string>("");
  const [agentMode, setAgentMode] = useState<'smart' | 'swarm' | 'single'>('smart');
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<ClawAgent | null>(null);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [humanRequest, setHumanRequest] = useState<HumanRequest | null>(null);
  const [runtimeStats, setRuntimeStats] = useState<RuntimeStats | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [isAgentStopping, setIsAgentStopping] = useState(false);
  const [experienceUiState, setExperienceUiState] = useState<ExperienceUiState | null>(null);
  const [resourceRuntime, setResourceRuntime] = useState<SandboxRuntimeSnapshot | null>(null);
  const [rootTaskRunId, setRootTaskRunId] = useState<string | null>(null);
  const [isClassifyingIntent, setIsClassifyingIntent] = useState<boolean>(false);
  const [pendingAutoLaunchRequest, setPendingAutoLaunchRequest] = useState<{ goal: string } | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(true);

  const stepCounterRef = useRef(0);
  const totalTokensRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const swarmCockpitOpenedRef = useRef(false);
  const resourceRuntimeRef = useRef<SandboxRuntimeSnapshot | null>(null);

  useEffect(() => {
    const checkConfig = () => {
      const plannerConfig = ENV.PLANNER_CONFIG;
      const configured = !!(plannerConfig.apiKey && plannerConfig.baseUrl && plannerConfig.modelName);
      setIsConfigured(configured);
    };

    checkConfig();
    const interval = setInterval(checkConfig, 2000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    const handleExperienceJob = (event: Event) => {
      const detail = (event as CustomEvent<ExperienceJobEvent>).detail;
      if (!detail) return;

      if (detail.type === 'queued') {
        setExperienceUiState({
          visible: true,
          status: 'queued',
          text: t('experience.queued'),
          taskRunId: detail.taskRunId,
          goal: detail.goal,
          liveStatusSnapshot: {
            phase: 'queued',
            updatedAt: Date.now(),
            currentStepTitle: t('experience.phase.queued'),
            lastMessage: t('experience.queued'),
          },
        });
        return;
      }

      if (detail.type === 'running') {
        setExperienceUiState((prev) => ({
          visible: true,
          status: 'running',
          text: t('experience.status.processing'),
          taskRunId: detail.taskRunId,
          goal: detail.goal,
          liveStatusSnapshot: detail.liveStatusSnapshot,
          globalSummary: prev?.globalSummary,
          experienceBuffer: prev?.experienceBuffer,
          rawResponse: prev?.rawResponse,
          candidates: prev?.candidates,
          committed: prev?.committed,
          committedMemories: prev?.committedMemories,
          syncDetails: prev?.syncDetails,
          error: undefined,
        }));
        return;
      }

      if (detail.type === 'completed') {
        setExperienceUiState({
          visible: true,
          status: 'completed',
          text: t('experience.complete'),
          taskRunId: detail.taskRunId,
          goal: detail.goal,
          globalSummary: detail.globalSummary,
          experienceBuffer: detail.experienceBuffer,
          rawResponse: detail.rawResponse,
          candidates: detail.candidates,
          committed: detail.committed,
          committedMemories: detail.committedMemories,
          syncDetails: detail.syncDetails,
          liveStatusSnapshot: undefined,
        });
        return;
      }

      if (detail.type === 'failed') {
        setExperienceUiState((prev) => ({
          visible: true,
          status: 'failed',
          text: t('experience.status.failed', { error: detail.error }),
          taskRunId: detail.taskRunId,
          goal: detail.goal,
          error: detail.error,
          liveStatusSnapshot: prev?.liveStatusSnapshot,
        }));
      }
    };

    experienceJobEventTarget.addEventListener('experience-job', handleExperienceJob);
    return () => {
      experienceJobEventTarget.removeEventListener('experience-job', handleExperienceJob);
    };
  }, [addLog]);

  // Stable ref so the storage listener below always calls the latest handleStartAgent.
  const handleStartAgentRef = useRef<typeof handleStartAgent | null>(null);

  useEffect(() => {
    if (!experienceUiState?.taskRunId) return;
    if (experienceUiState.status !== 'completed' && experienceUiState.status !== 'failed') return;

    let cancelled = false;

    const refreshSyncDetails = async () => {
      try {
        const syncDetails = await buildExperienceSyncDetails(
          experienceUiState.taskRunId!,
          experienceUiState.committedMemories || [],
        );
        if (cancelled) return;
        setExperienceUiState((prev) => {
          if (!prev || prev.taskRunId !== experienceUiState.taskRunId) return prev;
          return {
            ...prev,
            syncDetails,
          };
        });
      } catch (error) {
        console.warn('[ExperienceUI] Failed to refresh notion sync details:', error);
      }
    };

    void refreshSyncDetails();
    const intervalId = window.setInterval(() => {
      void refreshSyncDetails();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [experienceUiState?.taskRunId, experienceUiState?.status, experienceUiState?.committedMemories]);

  const resolveModelByNode = (node: string): string => {
    if (node === 'cortex') return 'midscene-internal';
    return ENV.PLANNER_CONFIG.modelName || 'unknown';
  };

  const buildRuntimeFromStep = (step: any): { modelName: string; stepTokens: number } => {
    const payloads = Array.isArray(step?.update?.llm_payloads) ? step.update.llm_payloads : [];
    const latest = payloads.length > 0 ? payloads[payloads.length - 1] : null;
    const usage = latest?.token_usage || {};
    const stepTokens = Number(usage.total ?? 0);
    const modelName = latest?.model || latest?.payload?.model || resolveModelByNode(step?.node || "unknown");
    return { modelName, stepTokens };
  };

  const extractFinalConclusion = (finalState: any): string | null => {
    if (finalState?.subtask_results && finalState?.scheduler_runtime) {
      const completedIds = Array.isArray(finalState.scheduler_runtime.completed)
        ? [...finalState.scheduler_runtime.completed]
        : [];
      for (let i = completedIds.length - 1; i >= 0; i -= 1) {
        const nodeId = completedIds[i];
        const summary = finalState.subtask_results?.[nodeId]?.summary;
        if (typeof summary === 'string' && summary.trim()) {
          return summary.trim();
        }
      }
      if (completedIds.length > 0) {
        return `DAG tasks completed: ${completedIds.join(" -> ")}`;
      }
    }

    const plannerAction = finalState?.planner_output?.action;
    const direct =
      plannerAction?.result ||
      plannerAction?.summary ||
      plannerAction?.description ||
      finalState?.step_summary ||
      finalState?.watchdog_output?.reason;

    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const history = Array.isArray(finalState?.total_history) ? [...finalState.total_history] : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      const action = item?.action;
      const res = action?.result || action?.summary || item?.step_summary || action?.description;
      if (typeof res === 'string' && res.trim()) {
        return res.trim();
      }
    }

    return null;
  };

  const extractSandboxSummary = (finalState: any): string | null => {
    const assignments = Array.isArray(finalState?.resource_runtime?.assignments)
      ? finalState.resource_runtime.assignments
      : [];
    if (assignments.length === 0) {
      return null;
    }

    const nodeLabels = assignments
      .map((item: any) => {
        const nodeId = typeof item?.nodeId === 'string' ? item.nodeId : 'unknown';
        const tabId = typeof item?.tabId === 'number' ? item.tabId : '?';
        return `${nodeId}@tab${tabId}`;
      })
      .join(' · ');

    return t('logs.sandboxExecution', { nodes: nodeLabels });
  };

  const handleOpenSwarm = async (options: { active?: boolean } = {}) => {
    const url = chrome.runtime.getURL("swarm.html");
    const currentGroupId = resourceRuntimeRef.current?.groupId;

    try {
      const tabs = await chrome.tabs.query({ url });
      let cockpitTabId: number;
      if (tabs && tabs.length > 0) {
        cockpitTabId = tabs[0].id!;
        if (options.active !== false) {
          await chrome.tabs.update(cockpitTabId, { active: true });
          const tab = await chrome.tabs.get(cockpitTabId);
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } else {
        const tab = await chrome.tabs.create({ url, active: options.active ?? true });
        cockpitTabId = tab.id!;
      }

      // Group the tab if a groupId exists
      if (typeof currentGroupId === 'number' && cockpitTabId) {
        await chrome.tabs.group({ tabIds: cockpitTabId, groupId: currentGroupId }).catch(e => {
          console.warn("[useAgentControl] Failed to group swarm cockpit:", e);
        });
      }
    } catch (error) {
      console.warn("[useAgentControl] Failed to open/group swarm cockpit:", error);
    }
  };

  const openSwarmCockpitOnce = async () => {
    if (swarmCockpitOpenedRef.current) return;
    swarmCockpitOpenedRef.current = true;
    await handleOpenSwarm({ active: true });
  };

  const handleStartAgent = async (
    goalOverride?: string,
    options: StartAgentOptions | boolean = {}
  ) => {
    if (isAgentRunning || isAgentStopping) return;

    const startOptions: StartAgentOptions = typeof options === "boolean"
      ? { skipIntentClassification: options }
      : options;
    const {
      skipIntentClassification = false,
      forceDagPlanning = false,
      suppressUserLog = false,
    } = startOptions;

    const goalToRun = (goalOverride ?? agentGoal).trim();
    if (!goalToRun) return;

    // Clear input and set running state early to improve UX and prevent duplicate clicks
    setAgentGoal("");
    setIsAgentRunning(true);

    if (!suppressUserLog) {
      addLog('user', goalToRun);
    }

    let targetTabId: number;
    try {
      const resolved = await resolveTargetTabId();
      if (!resolved) {
        addLog('system', t('logs.noActivePage'), true);
        setIsAgentRunning(false);
        return;
      }
      targetTabId = resolved;
    } catch (error) {
      addLog('system', t('logs.noActivePage'), true);
      setIsAgentRunning(false);
      return;
    }

    try {
      const targetTab = await chrome.tabs.get(targetTabId);
      if (isRestrictedStartupUrl(targetTab.url)) {
        addLog(
          'system',
          t('agent.loading'),
          false,
          false,
          { displayStyle: 'inline-status' },
        );
        const fallbackTab = await chrome.tabs.create({ url: RESTRICTED_PAGE_FALLBACK_URL, active: true });
        if (!fallbackTab.id) {
          throw new Error("Google tab was created without a tab id");
        }
        targetTabId = fallbackTab.id;
        await waitForTabComplete(targetTabId);
        onTabSwitch?.(targetTabId);
      }
    } catch (error: any) {
      addLog('system', t('logs.runError', { error: error?.message || String(error) }), true);
      setIsAgentRunning(false);
      return;
    }

    try {
      await loadDynamicConfig();
    } catch (error) {
      console.warn("[useAgentControl] Failed to refresh llmConfig before run:", error);
    }

    const plannerConfig = ENV.PLANNER_CONFIG;
    if (!plannerConfig.apiKey || !plannerConfig.baseUrl || !plannerConfig.modelName) {
      addLog('system', t('step.error.apiKey'), true);
      setIsAgentRunning(false);
      return;
    }

    if (!skipIntentClassification) {
      setIsClassifyingIntent(true);
      addLog('system', t('logs.analyzingIntent'), false, false, { displayStyle: 'inline-status' });
      try {
        const intentResult = await classifyIntent(goalToRun);
        if (intentResult.useSwarm) {
          addLog('system', t('logs.intentSwarm', { reason: intentResult.reason }), false, false, { displayStyle: 'inline-status' });
          setPendingAutoLaunchRequest({ goal: goalToRun });
          setIsClassifyingIntent(false);
          setIsAgentRunning(false);
          return; // Wait for user confirmation
        } else {
          addLog('system', t('logs.intentSingle', { reason: intentResult.reason }), false, false, { displayStyle: 'inline-status' });
          setIsClassifyingIntent(false);
        }
      } catch (err: any) {
        setIsClassifyingIntent(false);
        addLog('system', t('logs.intentFailed'), false, false, { displayStyle: 'inline-status' });
      }
    }

    setRuntimeStats(null);
    setRunningTabId(targetTabId);
    setResourceRuntime(null);
    setRootTaskRunId(null);
    resourceRuntimeRef.current = null;
    beginWorkflowRun();
    stepCounterRef.current = 0;
    totalTokensRef.current = 0;
    streamTotalTokensRef.current = 0;
    startTimeRef.current = Date.now();
    swarmCockpitOpenedRef.current = false;
    await chrome.storage.local.remove([
      "swarmRuntimeSnapshot",
      "swarmWorkflowNodes",
      "swarmLaunchRequest",
      "swarmDraftGoal",
      "swarmLifecycleSnapshot",
    ]).catch(() => {});

    const launchRequest = parseAgentLaunchInput(goalToRun);
    const shouldMonitorSwarm = forceDagPlanning;
    if (shouldMonitorSwarm) {
      await chrome.storage.local.set({
        swarmLifecycleSnapshot: buildDagPlanLifecycle("swarm_starting", launchRequest.goal),
      }).catch(() => {});
    }

    addLog('agent', forceDagPlanning ? t('logs.initializingSwarm') : t('logs.initializing'));

    try { await cdp.attach(targetTabId); } catch (e) {
      console.warn("[useAgentControl] Pre-attach failed (may already be attached):", e);
    }

    const agentRun = orchestrator.runInCurrentTab({
      tabId: targetTabId,
      goal: launchRequest.goal,
      sandboxTabDriver: new ChromeSandboxTabDriver(),
      onResourceRuntimeUpdate: (snapshot) => {
        setResourceRuntime(snapshot);
        resourceRuntimeRef.current = snapshot;
        chrome.storage.local.set({ swarmRuntimeSnapshot: snapshot }).catch(() => {});
        if (shouldMonitorSwarm) {
          const hasAgents = (snapshot?.agents?.length ?? 0) > 0;
          chrome.storage.local.set({
            swarmLifecycleSnapshot: buildDagPlanLifecycle(
              hasAgents ? "swarm_running" : "swarm_starting",
              launchRequest.goal,
            ),
          }).catch(() => {});
          if (hasAgents) {
            openSwarmCockpitOnce().catch(() => {});
          }
        }
      },
      memory: new AgentMemoryProvider(),
      onStep: (step: any) => {
        if (typeof step.taskRunId === "string") {
          setRootTaskRunId((current) => current ?? step.taskRunId);
        }
        stepCounterRef.current += 1;
        const stepNo = stepCounterRef.current;
        const { modelName, stepTokens } = buildRuntimeFromStep(step);
        totalTokensRef.current += stepTokens;
        const nextRuntime: RuntimeStats = {
          stepNo,
          node: step.node || "unknown",
          modelName,
          durationMs: Number(step.duration_ms || 0),
          stepTokens,
          totalTokens: totalTokensRef.current
        };
        setRuntimeStats(nextRuntime);
        recordWorkflowStep({ ...step, runtime: nextRuntime });

        // If executor switched tabs, notify App so it can update the UI binding.
        const newBoundTabId = step.update?.meta_data?.boundTabId;
        if (newBoundTabId && onTabSwitch) {
          onTabSwitch(newBoundTabId);
        }
      },
      onFinish: (result: any) => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        const total = streamTotalTokensRef.current || totalTokensRef.current;
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        const finalConclusion = extractFinalConclusion(result);
        const sandboxSummary = extractSandboxSummary(result);
        if (shouldMonitorSwarm) {
          chrome.storage.local.set({
            swarmLifecycleSnapshot: buildDagPlanLifecycle("swarm_finished", launchRequest.goal),
            swarmRuntimeSnapshot: result?.resource_runtime ?? resourceRuntimeRef.current,
          }).catch(() => {});
        }
        if (finalConclusion) {
          addLog('agent', finalConclusion);
        }
        if (sandboxSummary) {
          addLog('system', sandboxSummary, false, false, { displayStyle: 'inline-status' });
        }
        const tokenInfo = total > 0 ? ` · ${t('process.stepCounter', { num: 0, tokens: total }).split('·')[1].trim()}` : '';
        addLog('system', t('logs.taskCompleted', { 
          duration: `${durationSec}s`, 
          tokens: tokenInfo
        }), false, true);
        triggerMemorySync?.().catch((error) => {
          console.warn("[useAgentControl] Failed to sync memory after finish:", error);
        });
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onError: (err: any) => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        if (shouldMonitorSwarm) {
          chrome.storage.local.set({
            swarmLifecycleSnapshot: buildDagPlanLifecycle("swarm_failed", launchRequest.goal, err?.message || String(err)),
          }).catch(() => {});
        }
        addLog('system', t('logs.taskFailed', { error: err.message, duration: `${durationSec}s` }), true);
        triggerMemorySync?.().catch((error) => {
          console.warn("[useAgentControl] Failed to sync memory after error:", error);
        });
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onStopped: () => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        setHumanRequest(null);
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        if (shouldMonitorSwarm) {
          chrome.storage.local.set({
            swarmLifecycleSnapshot: buildDagPlanLifecycle("swarm_failed", launchRequest.goal, t('input.stoppingTitle')),
          }).catch(() => {});
        }
        addLog('system', t('logs.taskStopped', { duration: `${durationSec}s` }), false, true);
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onHumanRequest: (req: HumanRequest) => {
        setCurrentAgent(orchestrator.getActiveAgent(targetTabId));
        setHumanRequest(req);
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        addLog('system', t('logs.awaitingAuth', { message: req.message }));
      }
    });

    setCurrentAgent(orchestrator.getActiveAgent(targetTabId));

    agentRun.catch((err: any) => {
      console.error("Agent start error:", err);
      setIsAgentRunning(false);
      setIsAgentStopping(false);
      if (shouldMonitorSwarm) {
        chrome.storage.local.set({
          swarmLifecycleSnapshot: buildDagPlanLifecycle("swarm_failed", launchRequest.goal, err?.message || String(err)),
        }).catch(() => {});
      }
      addLog('system', t('logs.runError', { error: err.message }), true);
      setCurrentAgent(null);
      setRunningTabId(null);
    });
  };

  // Keep ref up-to-date so the storage listener always calls the latest version.
  handleStartAgentRef.current = handleStartAgent;

  // Listen for swarm launch requests posted by the cockpit page via chrome.storage.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const req = changes.swarmLaunchRequest?.newValue;
      if (!req?.goal || !req?.timestamp) return;
      chrome.storage.local.remove("swarmLaunchRequest").catch(() => {});
      handleStartAgentRef.current?.(req.goal, {
        skipIntentClassification: true,
        forceDagPlanning: true,
      });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleStopAgent = () => {
    if ((!isAgentRunning && !humanRequest) || isAgentStopping) return;
    setStopConfirmOpen(true);
  };

  const handleCancelStop = () => {
    setStopConfirmOpen(false);
  };

  const handleConfirmStop = async () => {
    setStopConfirmOpen(false);

    try {
      if (humanRequest) {
        if (currentAgent) {
          await currentAgent.stop();
        }
        setHumanRequest(null);
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        setCurrentAgent(null);
        setRunningTabId(null);
        addLog('system', t('logs.taskStopped', { duration: '' }), false, true);
        return;
      }

      setIsAgentStopping(true);
      addLog('system', t('agent.stopping'));

      if (runningTabId !== null) {
        await orchestrator.cancelAgent(runningTabId);
      } else if (currentAgent) {
        await currentAgent.stop();
      }
    } catch (err: any) {
      setIsAgentStopping(false);
      addLog('system', t('logs.runError', { error: err.message }), true);
    }
  };

  const handleHumanResponse = async (confirmed: boolean) => {
    if (!currentAgent) return;
    setHumanRequest(null);
    setIsAgentRunning(true);
    addLog('user', confirmed ? t('humanLoop.allow') : t('humanLoop.reject'));
    await currentAgent.resume({ confirmed });
  };

  const handleConfirmAutoLaunch = async (useDag: boolean) => {
    if (!pendingAutoLaunchRequest) return;
    const goal = pendingAutoLaunchRequest.goal;
    setPendingAutoLaunchRequest(null);
    if (useDag) {
      addLog('user', t('swarm.autoLaunch.confirm'));
      await handleStartAgent(goal, {
        skipIntentClassification: true,
        forceDagPlanning: true,
        suppressUserLog: true,
      });
    } else {
      addLog('user', t('swarm.autoLaunch.single'));
      await handleStartAgent(goal);
    }
  };

  const handleCancelAutoLaunch = () => {
    setPendingAutoLaunchRequest(null);
    addLog('system', t('swarm.autoLaunch.cancel'), false, true);
  };

  const handleCloseSwarmTabGroup = async () => {
    const currentRuntime = resourceRuntimeRef.current;
    const groupId = currentRuntime?.groupId;
    if (typeof groupId !== "number") {
      return;
    }

    try {
      await new ChromeSandboxTabDriver().destroyGroup(groupId);
      const nextRuntime: SandboxRuntimeSnapshot = {
        ...currentRuntime,
        groupId: null,
        assignments: [],
        updatedAt: Date.now(),
      };
      setResourceRuntime(nextRuntime);
      resourceRuntimeRef.current = nextRuntime;
      chrome.storage.local.set({ swarmRuntimeSnapshot: nextRuntime }).catch(() => {});
      addLog('system', t('logs.closedSwarmTabs'), false, true);
    } catch (error: any) {
      addLog('system', t('logs.closeSwarmTabsFailed', { error: error?.message || String(error) }), true);
    }
  };

  return {
    agentGoal,
    setAgentGoal,
    experienceUiState,
    resourceRuntime,
    rootTaskRunId,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    runningTabId,
    stopConfirmOpen,
    isClassifyingIntent,
    pendingAutoLaunchRequest,
    setPendingAutoLaunchRequest,
    handleStartAgent,
    handleOpenSwarm,
    handleStopAgent,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse,
    handleConfirmAutoLaunch,
    handleCancelAutoLaunch,
    handleCloseSwarmTabGroup,
    isConfigured
  };
}
