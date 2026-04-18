import { useState, useRef, MutableRefObject } from 'react';
import { ClawAgent, HumanRequest } from '../../lib/claw';
import { orchestrator } from '../../core/orchestrator/AgentOrchestrator';
import { LocalMemoryProvider } from '../../shared/utils/memory/local-memory';
import { ENV } from '../../shared/constants/env';
import { cdp } from '../../lib/claw';
import { RuntimeStats } from './useAppLogs';

export function useAgentControl(
  addLog: (
    sender: 'user' | 'agent' | 'system',
    text: string,
    isError?: boolean,
    isSuccess?: boolean,
    options?: { isDebug?: boolean; isPlan?: boolean }
  ) => void,
  beginWorkflowRun: () => void,
  recordWorkflowStep: (step: any) => void,
  resolveTargetTabId: () => Promise<number | null>,
  streamTotalTokensRef: MutableRefObject<number>
) {
  const [agentGoal, setAgentGoal] = useState<string>("");
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<ClawAgent | null>(null);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [humanRequest, setHumanRequest] = useState<HumanRequest | null>(null);
  const [runtimeStats, setRuntimeStats] = useState<RuntimeStats | null>(null);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [isAgentStopping, setIsAgentStopping] = useState(false);

  const stepCounterRef = useRef(0);
  const totalTokensRef = useRef(0);
  const startTimeRef = useRef<number>(0);

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
      memory: new LocalMemoryProvider(),
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
            if (action.type === 'UI_INTERACT') {
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
        setCurrentAgent(null);
        setRunningTabId(null);
      },
      onError: (err: any) => {
        setIsAgentRunning(false);
        setIsAgentStopping(false);
        const durationSec = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
        addLog('system', `❌ 任务失败: ${err.message} (耗时 ${durationSec}s)`, true);
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
