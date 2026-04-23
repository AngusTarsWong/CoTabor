import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { ClawAgent, HumanRequest } from '../../lib/claw';
import { orchestrator } from '../../core/orchestrator/AgentOrchestrator';
import { AgentMemoryProvider } from '../../shared/utils/memory/agent-memory';
import { DocLogger } from '../../shared/utils/logger/doc-logger';
import { ENV } from '../../shared/constants/env';
import { cdp } from '../../lib/claw';
import { RuntimeStats } from './useAppLogs';
import { experienceJobEventTarget, ExperienceJobEvent } from '../../memory/experience-job/events';
import { ExperienceUiState } from '../types/experience-ui';
import { buildExperienceSyncDetails } from '../../memory/task-commit/experience-sync-details-builder';

export function useAgentControl(
  addLog: (
    sender: 'user' | 'agent' | 'system',
    text: string,
    isError?: boolean,
    isSuccess?: boolean,
    options?: { isDebug?: boolean; isPlan?: boolean; displayStyle?: 'bubble' | 'inline-status' }
  ) => void,
  beginWorkflowRun: () => void,
  recordWorkflowStep: (step: any) => void,
  resolveTargetTabId: () => Promise<number | null>,
  streamTotalTokensRef: MutableRefObject<number>,
  triggerMemorySync?: () => Promise<void>
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

  const handleStartAgent = async (goalOverride?: string) => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) {
      addLog('system', "未找到活动页面，无法启动 Agent。", true);
      return;
    }
    const goalToRun = (goalOverride ?? agentGoal).trim();
    if (!goalToRun) return;
    if (isAgentRunning || isAgentStopping) return;

    setIsAgentRunning(true);
    setRuntimeStats(null);
    setRunningTabId(targetTabId);
    beginWorkflowRun();
    stepCounterRef.current = 0;
    totalTokensRef.current = 0;
    streamTotalTokensRef.current = 0;
    startTimeRef.current = Date.now();
    addLog('user', goalToRun);
    addLog('agent', "初始化 Agent 并连接页面...", false, false, { isDebug: true });

    try { await cdp.attach(targetTabId); } catch (e) {}

    setAgentGoal(""); 

    const agentRun = orchestrator.runInCurrentTab({
      tabId: targetTabId,
      goal: goalToRun,
      logger: new DocLogger(),
      memory: new AgentMemoryProvider(),
      onLog: (msg: string) => addLog('agent', msg, false, false, { isDebug: true }),
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

        const nodeName = step?.node;
        const update = step?.update || {};
        if (nodeName === 'planner' || nodeName === 'replanner') {
          const action = update?.planner_output?.action;
          if (action && action.type !== 'finish') {
            let planMsg = '';
            if (action.type === 'ui_interact') {
              planMsg = `👉 我计划在页面上执行：${action.intent}`;
            } else if (action.type === 'call_skill') {
              planMsg = `🛠️ 我准备使用技能：${action.description || action.skill_name}`;
            } else if (action.type === 'memorize') {
              planMsg = `📝 记录信息：${action.description || '将关键数据写入记忆库'}`;
            } else {
              planMsg = `👉 计划动作：${action.description || action.type}`;
            }
            addLog('agent', planMsg, false, false, { isPlan: true });
          }
        }
      },
      onFinish: (result: any) => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        const total = streamTotalTokensRef.current || totalTokensRef.current;
        const tokenStr = total > 0 ? ` · 总计 ${total} tokens` : '';
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        const timeStr = ` · 耗时 ${durationSec}s`;
        const finalConclusion = extractFinalConclusion(result);
        if (finalConclusion) {
          addLog('agent', finalConclusion);
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

  return {
    agentGoal,
    setAgentGoal,
    experienceUiState,
    isAgentRunning,
    isAgentStopping,
    humanRequest,
    runtimeStats,
    runningTabId,
    stopConfirmOpen,
    handleStartAgent,
    handleStopAgent,
    handleCancelStop,
    handleConfirmStop,
    handleHumanResponse
  };
}
