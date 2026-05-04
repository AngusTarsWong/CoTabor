import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { ClawAgent, HumanRequest } from '../../lib/claw';
import { orchestrator } from '../../core/orchestrator/AgentOrchestrator';
import { parseAgentLaunchInput } from '../../core/orchestrator/launch-request';
import { planDagLaunchFromGoal } from '../../core/orchestrator/planning/DagLaunchPlanner';
import { classifyIntent } from '../../core/orchestrator/planning/IntentClassifier';
import { AgentMemoryProvider } from '../../shared/utils/memory/agent-memory';
import { ENV, loadDynamicConfig } from '../../shared/constants/env';
import { cdp } from '../../lib/claw';
import { RuntimeStats } from './useAppLogs';
import { experienceJobEventTarget, ExperienceJobEvent } from '../../memory/experience-job/events';
import { ExperienceUiState } from '../types/experience-ui';
import { buildExperienceSyncDetails } from '../../memory/task-commit/experience-sync-details-builder';
import type { SidepanelLaunchMode } from '../types/launch-mode';
import type { SandboxRuntimeSnapshot } from '../../core/orchestrator/types/ResourceRuntime';
import {
  listReplayableDagNodes,
  loadTaskRunReplaySnapshot,
  type ReplayableDagNode,
} from '../../core/orchestrator/replay/TaskRunReplay';
import {
  buildPartialDagReplayPayload,
  listReplayableDagBranches,
  type ReplayableDagBranchTarget,
} from '../../core/orchestrator/replay/DagPartialReplay';

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
  const [agentGoal, setAgentGoal] = useState<string>("");
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<ClawAgent | null>(null);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [humanRequest, setHumanRequest] = useState<HumanRequest | null>(null);
  const [runtimeStats, setRuntimeStats] = useState<RuntimeStats | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [isAgentStopping, setIsAgentStopping] = useState(false);
  const [experienceUiState, setExperienceUiState] = useState<ExperienceUiState | null>(null);
  const [launchMode, setLaunchMode] = useState<SidepanelLaunchMode>('single');
  const [resourceRuntime, setResourceRuntime] = useState<SandboxRuntimeSnapshot | null>(null);
  const [dagReplayTargets, setDagReplayTargets] = useState<ReplayableDagNode[]>([]);
  const [dagBranchReplayTargets, setDagBranchReplayTargets] = useState<ReplayableDagBranchTarget[]>([]);
  const [replayLoadingKey, setReplayLoadingKey] = useState<string | null>(null);
  const [lastDagResult, setLastDagResult] = useState<any>(null);
  const [isClassifyingIntent, setIsClassifyingIntent] = useState<boolean>(false);
  const [pendingAutoLaunchRequest, setPendingAutoLaunchRequest] = useState<{ goal: string } | null>(null);

  const stepCounterRef = useRef(0);
  const totalTokensRef = useRef(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleExperienceJob = (event: Event) => {
      const detail = (event as CustomEvent<ExperienceJobEvent>).detail;
      if (!detail) return;

      if (detail.type === 'queued') {
        setExperienceUiState({
          visible: true,
          status: 'queued',
          text: '经验任务已加入后台处理队列',
          taskRunId: detail.taskRunId,
          goal: detail.goal,
          liveStatusSnapshot: {
            phase: 'queued',
            updatedAt: Date.now(),
            currentStepTitle: '等待后台经验任务启动',
            lastMessage: '任务主链已完成，经验任务已进入后台队列',
          },
        });
        return;
      }

      if (detail.type === 'running') {
        setExperienceUiState((prev) => ({
          visible: true,
          status: 'running',
          text: '经验总结处理中...',
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
          text: '经验处理已完成',
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
          text: '经验总结失败，等待重试',
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
        return `DAG 任务已完成：${completedIds.join(" -> ")}`;
      }
    }

    const plannerAction = finalState?.planner_output?.action;
    if (plannerAction?.type === 'finish') {
      const direct =
        plannerAction.result ||
        plannerAction.summary ||
        plannerAction.description;
      if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
      }
    }

    const history = Array.isArray(finalState?.total_history) ? [...finalState.total_history] : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      if (item?.action?.type === 'finish') {
        const finishText =
          item?.action?.result ||
          item?.action?.summary ||
          item?.step_summary ||
          item?.action?.description;
        if (typeof finishText === 'string' && finishText.trim()) {
          return finishText.trim();
        }
      }
    }

    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      if (typeof item?.step_summary === 'string' && item.step_summary.trim()) {
        return item.step_summary.trim();
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

    return `🗂️ 隔离标签执行：${nodeLabels}`;
  };

  const handleStartAgent = async (
    goalOverride?: string,
    options?: { forcedLaunchMode?: SidepanelLaunchMode },
  ) => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) {
      addLog('system', "未找到活动页面，无法启动 Agent。", true);
      return;
    }
    const goalToRun = (goalOverride ?? agentGoal).trim();
    if (!goalToRun) return;
    const effectiveLaunchMode: SidepanelLaunchMode = options?.forcedLaunchMode ?? launchMode;
    
    if (isAgentRunning || isAgentStopping) return;

    try {
      await loadDynamicConfig();
    } catch (error) {
      console.warn("[useAgentControl] Failed to refresh llmConfig before run:", error);
    }

    const plannerConfig = ENV.PLANNER_CONFIG;
    if (!plannerConfig.apiKey || !plannerConfig.baseUrl || !plannerConfig.modelName) {
      addLog('system', "❌ 未检测到完整的大模型配置。请在设置中确认 API Key、Base URL 和 Model Name 已保存。", true);
      return;
    }

    if (effectiveLaunchMode === 'auto') {
      setIsClassifyingIntent(true);
      addLog('system', "🧠 正在分析任务意图...", false, false, { displayStyle: 'inline-status' });
      try {
        const intentResult = await classifyIntent(goalToRun);
        if (intentResult.useSwarm) {
          addLog('system', `🐝 分析完毕：这是一个跨页/复杂任务（原因：${intentResult.reason}）。等待授权蜂群模式...`, false, false, { displayStyle: 'inline-status' });
          setPendingAutoLaunchRequest({ goal: goalToRun });
          setIsClassifyingIntent(false);
          return; // Wait for user confirmation
        } else {
          addLog('system', `👤 分析完毕：建议在当前页面专注执行（原因：${intentResult.reason}）。`, false, false, { displayStyle: 'inline-status' });
          // Proceed as single
          setIsClassifyingIntent(false);
          return handleStartAgent(goalToRun, { forcedLaunchMode: 'single' });
        }
      } catch (err: any) {
        setIsClassifyingIntent(false);
        addLog('system', `⚠️ 意图分析失败，退化为单兵模式执行。`, false, false, { displayStyle: 'inline-status' });
        return handleStartAgent(goalToRun, { forcedLaunchMode: 'single' });
      }
    }

    let launchRequest = parseAgentLaunchInput(goalToRun);

    if (effectiveLaunchMode === 'dag' && launchRequest.mode !== 'dag') {
      addLog('system', "🧭 正在根据目标自动规划 DAG...", false, false, { displayStyle: 'inline-status' });
      try {
        const planned = await planDagLaunchFromGoal(goalToRun);
        launchRequest = planned.request;
        addLog(
          'system',
          `🧭 已自动规划 DAG：${planned.request.subtasks?.length ?? 0} 个子任务，模式 ${planned.request.executionMode ?? 'shared_tab'}`,
          false,
          false,
          { displayStyle: 'inline-status' },
        );
      } catch (error: any) {
        addLog('system', `❌ DAG 自动规划失败: ${error?.message || String(error)}`, true);
        return;
      }
    }

    setIsAgentRunning(true);
    setRuntimeStats(null);
    setRunningTabId(targetTabId);
    setResourceRuntime(null);
    setDagReplayTargets([]);
    setDagBranchReplayTargets([]);
    setReplayLoadingKey(null);
    setLastDagResult(null);
    beginWorkflowRun();
    stepCounterRef.current = 0;
    totalTokensRef.current = 0;
    streamTotalTokensRef.current = 0;
    startTimeRef.current = Date.now();
    addLog('user', launchRequest.goal);
    if (launchRequest.mode === 'dag') {
      const parallelHint = launchRequest.maxParallelSubAgents ?? 2;
      const executionMode = launchRequest.executionMode ?? 'shared_tab';
      addLog(
        'system',
        `🧭 检测到 DAG 请求：${launchRequest.subtasks?.length ?? 0} 个子任务，模式 ${executionMode}，并发上限 ${parallelHint}`,
        false,
        false,
        { displayStyle: 'inline-status' }
      );
    }
    addLog('agent', "初始化 Agent 并连接页面...");

    try { await cdp.attach(targetTabId); } catch (e) {
      console.warn("[useAgentControl] Pre-attach failed (may already be attached):", e);
    }

    setAgentGoal(""); 
    setLaunchMode('single');

    const agentRun = orchestrator.runInCurrentTab({
      tabId: targetTabId,
      goal: launchRequest.goal,
      subtasks: launchRequest.subtasks,
      maxParallelSubAgents: launchRequest.maxParallelSubAgents,
      executionMode: launchRequest.executionMode,
      onResourceRuntimeUpdate: (snapshot) => {
        setResourceRuntime(snapshot);
      },
      memory: new AgentMemoryProvider(),
      onStep: (step: any) => {
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
        setReplayLoadingKey(null);
        const total = streamTotalTokensRef.current || totalTokensRef.current;
        const tokenStr = total > 0 ? ` · 总计 ${total} tokens` : '';
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        const timeStr = ` · 耗时 ${durationSec}s`;
        const finalConclusion = extractFinalConclusion(result);
        const sandboxSummary = extractSandboxSummary(result);
        const replayTargets = listReplayableDagNodes(result);
        const branchReplayTargets = listReplayableDagBranches(result);
        setLastDagResult(branchReplayTargets.length > 0 || replayTargets.length > 0 ? result : null);
        setDagReplayTargets(replayTargets);
        setDagBranchReplayTargets(branchReplayTargets);
        if (finalConclusion) {
          addLog('agent', finalConclusion);
        }
        if (sandboxSummary) {
          addLog('system', sandboxSummary, false, false, { displayStyle: 'inline-status' });
        }
        addLog('system', `✅ 任务执行完毕！${timeStr}${tokenStr}`, false, true);
        triggerMemorySync?.().catch((error) => {
          console.warn("[useAgentControl] Failed to sync memory after finish:", error);
        });
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onError: (err: any) => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        setReplayLoadingKey(null);
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        addLog('system', `❌ 任务失败: ${err.message} (耗时 ${durationSec}s)`, true);
        triggerMemorySync?.().catch((error) => {
          console.warn("[useAgentControl] Failed to sync memory after error:", error);
        });
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onStopped: () => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        setReplayLoadingKey(null);
        setHumanRequest(null);
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        addLog('system', `✅ 当前任务已停止 (耗时 ${durationSec}s)。`, false, true);
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onHumanRequest: (req: HumanRequest) => {
        setCurrentAgent(orchestrator.getActiveAgent(targetTabId));
        setHumanRequest(req);
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        addLog('system', `[人工确认] 等待授权: ${req.message}`);
      }
    });

    setCurrentAgent(orchestrator.getActiveAgent(targetTabId));

    agentRun.catch((err: any) => {
      console.error("Agent start error:", err);
      setIsAgentRunning(false);
      setIsAgentStopping(false);
      addLog('system', `❌ 运行异常: ${err.message}`, true);
      setCurrentAgent(null);
      setRunningTabId(null);
    });
  };

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
        addLog('system', "✅ 当前任务已停止。", false, true);
        return;
      }

      setIsAgentStopping(true);
      addLog('system', "⚠️ 正在停止当前任务，等待当前步骤完成...");

      if (runningTabId !== null) {
        await orchestrator.cancelAgent(runningTabId);
      } else if (currentAgent) {
        await currentAgent.stop();
      }
    } catch (err: any) {
      setIsAgentStopping(false);
      addLog('system', `❌ 停止任务失败: ${err.message}`, true);
    }
  };

  const handleHumanResponse = async (confirmed: boolean) => {
    if (!currentAgent) return;
    setHumanRequest(null);
    setIsAgentRunning(true);
    addLog('user', confirmed ? "✅ 允许执行" : "❌ 拒绝执行");
    await currentAgent.resume({ confirmed });
  };

  const handleReplayDagNode = async (taskRunId: string) => {
    if (isAgentRunning || isAgentStopping) return;

    try {
      setReplayLoadingKey(`node:${taskRunId}`);
      const snapshot = await loadTaskRunReplaySnapshot(taskRunId);
      setLaunchMode('single');
      addLog('system', `♻️ 重放 DAG 节点：${snapshot.label}`, false, false, { displayStyle: 'inline-status' });
      await handleStartAgent(snapshot.replayGoal, { forcedLaunchMode: 'single' });
    } catch (error: any) {
      setReplayLoadingKey(null);
      addLog('system', `❌ 节点重放失败: ${error?.message || String(error)}`, true);
    }
  };

  const handleReplayDagBranch = async (failedNodeId: string) => {
    if (isAgentRunning || isAgentStopping) return;

    try {
      setReplayLoadingKey(`branch:${failedNodeId}`);
      if (!lastDagResult) {
        throw new Error("当前没有可用于局部重跑的 DAG 结果。");
      }
      const partialPayload = buildPartialDagReplayPayload(lastDagResult, failedNodeId);
      setLaunchMode('dag');
      addLog('system', `♻️ 局部重跑失败分支：${failedNodeId}`, false, false, { displayStyle: 'inline-status' });
      await handleStartAgent(JSON.stringify(partialPayload, null, 2), { forcedLaunchMode: 'dag' });
    } catch (error: any) {
      setReplayLoadingKey(null);
      addLog('system', `❌ 局部重跑失败: ${error?.message || String(error)}`, true);
    }
  };

  const handleConfirmAutoLaunch = async (useDag: boolean) => {
    if (!pendingAutoLaunchRequest) return;
    const goal = pendingAutoLaunchRequest.goal;
    setPendingAutoLaunchRequest(null);
    if (useDag) {
      addLog('user', "✅ 允许出动蜂群");
      await handleStartAgent(goal, { forcedLaunchMode: 'dag' });
    } else {
      addLog('user', "👤 仅在当前页面尝试");
      await handleStartAgent(goal, { forcedLaunchMode: 'single' });
    }
  };

  const handleCancelAutoLaunch = () => {
    setPendingAutoLaunchRequest(null);
    addLog('system', "❌ 已取消任务", false, true);
  };

  return {
    agentGoal,
    setAgentGoal,
    launchMode,
    setLaunchMode,
    experienceUiState,
    resourceRuntime,
    dagReplayTargets,
    dagBranchReplayTargets,
    replayLoadingKey,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    runningTabId,
    stopConfirmOpen,
    isClassifyingIntent,
    pendingAutoLaunchRequest,
    handleStartAgent,
    handleStopAgent,
    handleReplayDagNode,
    handleReplayDagBranch,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse,
    handleConfirmAutoLaunch,
    handleCancelAutoLaunch
  };
}
