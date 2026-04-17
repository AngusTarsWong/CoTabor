import React, { useState, useEffect, useRef } from "react";
import { cdp, dom, act, ElementInfo, ClawAgent, HumanRequest } from "../lib/claw";
import { orchestrator } from "../core/orchestrator/AgentOrchestrator";
import { TraceEvent } from "../shared/utils/trace";
import { VolcengineEmbeddingProvider } from "../memory/rag/embedding";
import { FeishuTableOperator } from "../skills/bundled/feishu-operator/api";
import { skillRegistry } from "../skills/registry";

import { Header } from "./components/Header";
import { DebugDrawer } from "./components/DebugDrawer";
import { ChatArea } from "./components/ChatArea";
import { HumanInTheLoopUI } from "./components/HumanInTheLoopUI";
import { InputArea } from "./components/InputArea";
import { loadDynamicConfig, ENV } from "../shared/constants/env";
import { getConflictingExtensionName } from "../shared/utils/extension-detector";
import { LocalMemoryProvider } from "../shared/utils/memory/local-memory";
import { stepEventTarget, LlmStepEvent } from "../shared/utils/llm-stream";
import { StepLog } from "./components/StepCard";

const SIDEPANEL_VERSION = "debug-2026.03.26-05-modern-ui";

type RuntimeStats = {
  stepNo: number;
  node: string;
  modelName: string;
  durationMs: number;
  stepTokens: number;
  totalTokens: number;
};

type LogMessage =
  | { sender: 'user' | 'agent' | 'system'; text: string; isError?: boolean; isSuccess?: boolean }
  | StepLog;

const App: React.FC = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [boundTabId, setBoundTabId] = useState<number | null>(null);
  const [boundTabTitle, setBoundTabTitle] = useState<string>("");
  const [boundTabUrl, setBoundTabUrl] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  
  // Agent State
  const [agentGoal, setAgentGoal] = useState<string>("");
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<ClawAgent | null>(null);
  const [humanRequest, setHumanRequest] = useState<HumanRequest | null>(null);
  
  // UI State
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [activeDebugTab, setActiveDebugTab] = useState<'browser' | 'skills'>('browser');
  const [skillTestLog, setSkillTestLog] = useState<string>("");
  const [runtimeStats, setRuntimeStats] = useState<RuntimeStats | null>(null);
  const stepCounterRef = useRef(0);
  const totalTokensRef = useRef(0);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const streamTotalTokensRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<LlmStepEvent>).detail;
      if (ev.type === 'STEP_START') {
        setLogs(prev => [...prev, {
          sender: 'step' as const,
          stepId: ev.stepId,
          node: ev.node,
          model: ev.model,
          status: 'running' as const,
          streamContent: '',
          startTime: Date.now(),
          isCollapsed: true,
        } as StepLog]);
      } else if (ev.type === 'STREAM_CHUNK' && ev.delta) {
        setLogs(prev => {
          const idx = [...prev].reverse().findIndex(
            l => l.sender === 'step' && (l as StepLog).stepId === ev.stepId
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          const s = updated[realIdx] as StepLog;
          updated[realIdx] = { ...s, streamContent: s.streamContent + ev.delta };
          return updated;
        });
      } else if (ev.type === 'STEP_END') {
        if (ev.tokens) {
          streamTotalTokensRef.current += ev.tokens.total;
        }
        setLogs(prev => {
          const idx = [...prev].reverse().findIndex(
            l => l.sender === 'step' && (l as StepLog).stepId === ev.stepId
          );
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const updated = [...prev];
          updated[realIdx] = {
            ...updated[realIdx] as StepLog,
            status: 'done',
            duration_ms: ev.duration_ms,
            tokens: ev.tokens,
          };
          return updated;
        });
      }
    };
    stepEventTarget.addEventListener('llm-step', handler);
    return () => stepEventTarget.removeEventListener('llm-step', handler);
  }, []);

  useEffect(() => {
    loadDynamicConfig().catch(e => console.warn('[Sidepanel] Failed to load dynamic config:', e));
    skillRegistry.loadAll().catch(e =>
      console.warn('[Sidepanel] MCP skill load failed:', e)
    );
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (sender: 'user' | 'agent' | 'system', text: string, isError = false, isSuccess = false) => {
    setLogs((prev) => [...prev, { sender, text, isError, isSuccess }]);
  };

  const addAgentLogs = (items: string[]) => {
    if (items.length === 0) return;
    setLogs((prev) => [...prev, ...items.map(text => ({ sender: 'agent' as const, text }))]);
  };

  const formatStepLogs = (step: any): string[] => {
    const node = step?.node || "unknown";
    const update = step?.update || {};
    const lines: string[] = [];

    if (node === "planner") {
      const action = update?.planner_output?.action;
      if (action) {
        lines.push(`🤔 计划动作: ${action.type} ${action.skill_name ? `(${action.skill_name})` : ""}`);
      }
    }

    if (node === "executor") {
      const last = Array.isArray(update?.total_history) && update.total_history.length > 0
        ? update.total_history[update.total_history.length - 1]
        : null;
      const result = last?.result;
      if (result) {
        lines.push(result.success ? `✅ 执行成功` : `❌ 执行失败: ${result.error}`);
      }
    }

    if (node === "watchdog") {
      const status = update?.watchdog_output?.status;
      if (status) {
        lines.push(`👀 检查状态: ${status}`);
      }
    }

    const modelName = step?.runtime?.modelName || "";
    const durationMs = Number(step?.duration_ms || 0);
    const stepTokens = Number(step?.runtime?.stepTokens || 0);
    if (modelName || durationMs > 0 || stepTokens > 0) {
      lines.push(`📊 ${node} · 模型: ${modelName || "N/A"} · 耗时: ${(durationMs / 1000).toFixed(2)}s · Token: ${stepTokens}`);
    }

    return lines;
  };

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

  const refreshActiveTabId = async (): Promise<number | null> => {
    const activeId = await new Promise<number | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0].id ?? null);
        } else {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
            resolve(fallbackTabs?.[0]?.id ?? null);
          });
        }
      });
    });
    if (activeId) {
      setTabId(activeId);
      return activeId;
    }
    return null;
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    return new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
            resolve(fallbackTabs?.[0] ?? null);
          });
        }
      });
    });
  };

  const refreshBoundTabInfo = async (id: number) => {
    try {
      const tab = await chrome.tabs.get(id);
      setBoundTabTitle(tab.title ?? "");
      setBoundTabUrl(tab.url ?? "");
      await chrome.storage.local.set({
        boundTabId: id,
        boundTabTitle: tab.title ?? "",
        boundTabUrl: tab.url ?? ""
      });
    } catch {
      setBoundTabTitle("");
    }
  };

  const bindCurrentPage = async (): Promise<number | null> => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      addLog('system', "错误：无法绑定，未找到当前页面。", true);
      return null;
    }
    
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    
    if (!url) {
      addLog('system', `错误：无法绑定该页面（无法获取URL）。这通常是因为 Chrome 的安全限制，请确保当前是一个普通的网页（或尝试刷新页面）。`, true);
      return null;
    }
    
    // 验证 URL 是否为受限页面
    const restrictedPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'view-source:'
    ];
    
    if (restrictedPrefixes.some(prefix => url.startsWith(prefix))) {
      addLog('system', `错误：无法绑定受限页面 (${url})。请切换到普通网页后再试。`, true);
      return null;
    }
    
    // 主动切换到该 Tab
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e: any) {
      console.warn('[bindCurrentPage] Failed to activate tab:', e);
    }
    
    // 尝试 attach CDP 会话，确保后续操作可用
    try {
      await cdp.attach(tab.id);
      addLog('system', `✅ CDP 会话已连接到页面: ${title || url}`, false, true);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      if (errorMsg.includes('Cannot access a chrome-extension:// URL of different extension')) {
        let pluginNameInfo = "其他浏览器插件（如翻译、去广告、密码管理等）";
        const conflictName = await getConflictingExtensionName(tab.id);
        if (conflictName) {
          pluginNameInfo = `【${conflictName}】插件`;
        }
        addLog('system', `❌ 绑定失败：当前页面被${pluginNameInfo}注入了内容，触发了 Chrome 的底层安全限制。建议：1. 刷新页面重试 2. 暂时禁用该插件 3. 在无痕模式下使用。`, true);
      } else {
        addLog('system', `⚠️ CDP 连接失败: ${errorMsg}。部分功能可能不可用。`, true);
      }
      return null;
    }
    
    await chrome.storage.local.set({ boundTabId: tab.id, boundTabTitle: title, boundTabUrl: url });
    setBoundTabId(tab.id);
    setBoundTabTitle(title);
    setBoundTabUrl(url);
    addLog('system', `已绑定页面: ${title || url}`, false, true);
    return tab.id;
  };

  const resolveTargetTabId = async (): Promise<number | null> => {
    if (boundTabId) return boundTabId;
    return refreshActiveTabId();
  };

  useEffect(() => {
    refreshActiveTabId().then((id) => {
      // Init logic
    });
    chrome.storage.local.get(["boundTabId", "boundTabTitle", "boundTabUrl"]).then((result) => {
      if (result.boundTabId) {
        const id = result.boundTabId as number;
        setBoundTabId(id);
        setBoundTabTitle((result.boundTabTitle as string) || "");
        setBoundTabUrl((result.boundTabUrl as string) || "");
        refreshBoundTabInfo(id).catch(() => {});
      }
    });

    const onActivated = () => refreshActiveTabId().catch(() => {});
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && changeInfo.status === "complete") refreshActiveTabId().catch(() => {});
      if (boundTabId && tab.id === boundTabId && changeInfo.status === "complete") {
        refreshBoundTabInfo(boundTabId).catch(() => {});
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    const onMsg = (msg: any) => {
      if (msg && msg.type === "TRACE_EVENT" && msg.data) {
        setTraceEvents((prev) => [...prev, msg.data as TraceEvent]);
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);

    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.llmConfig) {
        loadDynamicConfig().catch(() => {});
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.storage.onChanged.removeListener(onStorageChanged);
      try { chrome.runtime.onMessage.removeListener(onMsg); } catch {}
    };
  }, []);

  const handleBindCurrentPage = async () => {
    await refreshActiveTabId();
    await bindCurrentPage();
  };

  // --- Browser Debug Tools ---
  const handleAttach = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    try {
      await cdp.attach(targetTabId);
      setSkillTestLog(`Attached to debugger (tab ${targetTabId})`);
    } catch (e: any) {
      setSkillTestLog(`Attach failed: ${e.message}`);
    }
  };

  const handleDetach = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    await cdp.detach(targetTabId);
    setSkillTestLog(`Detached debugger (tab ${targetTabId})`);
  };

  const handleScan = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    try {
      setSkillTestLog("Scanning...");
      const els = await dom.scan(targetTabId);
      setElements(els);
      setSkillTestLog(`Scanned ${els.length} elements on tab ${targetTabId}`);
    } catch (e: any) {
      setSkillTestLog(`Scan failed: ${e.message}`);
    }
  };

  const handleClick = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId || !targetId) return;
    const el = elements.find((e) => e.id === Number(targetId));
    if (!el) {
      setSkillTestLog(`Element ${targetId} not found in scan results`);
      return;
    }
    try {
      const x = el.rect.x + el.rect.width / 2;
      const y = el.rect.y + el.rect.height / 2;
      await act.click(targetTabId, x, y);
      setSkillTestLog(`Clicked element ${targetId} at (${Math.round(x)}, ${Math.round(y)})`);
    } catch (e: any) {
      setSkillTestLog(`Click failed: ${e.message}`);
    }
  };

  const handleType = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId || !inputText) return;
    try {
      await act.type(targetTabId, inputText);
      setSkillTestLog(`Typed: "${inputText}"`);
    } catch (e: any) {
      setSkillTestLog(`Type failed: ${e.message}`);
    }
  };

  // --- Skill Debug Tools ---
  const testFeishuApi = async () => {
    setSkillTestLog("正在测试飞书 API 连接...");
    try {
      const result = await chrome.storage.local.get(['larkAppId', 'larkAppSecret', 'brainBaseConfig']);
      if (!result.larkAppId || !result.larkAppSecret || !result.brainBaseConfig?.memoriesAppToken) {
        setSkillTestLog("❌ 缺少飞书配置。请先在设置页完成初始化。");
        return;
      }

      const operator = new FeishuTableOperator({
        appId: result.larkAppId,
        appSecret: result.larkAppSecret,
        appToken: result.brainBaseConfig.memoriesAppToken,
        tableIds: result.brainBaseConfig.memoriesTableIds
      });

      const tables = await operator.getTables();
      setSkillTestLog(`✅ 飞书连接成功！读取到 ${tables.items.length} 个多维表格。`);
    } catch (error: any) {
      setSkillTestLog(`❌ 飞书 API 测试失败: ${error.message}`);
    }
  };

  const testVectorization = async () => {
    setSkillTestLog("正在测试火山引擎向量化 (Volcengine Embedding)...");
    try {
      // Assume the API key is passed via process.env in the build process, or we check storage.
      // Let's try directly initializing it. It will use the env var if available.
      const provider = new VolcengineEmbeddingProvider();
      const textToEmbed = "测试向量化能力";
      const vector = await provider.getEmbedding([{ type: "text", text: textToEmbed }]);
      
      setSkillTestLog(`✅ 向量化成功！\n输入: "${textToEmbed}"\n输出维度: ${vector.length} 维\n前5个值: ${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...`);
    } catch (error: any) {
      setSkillTestLog(`❌ 向量化测试失败: ${error.message}`);
    }
  };


  // --- Agent Controls ---
  const handleStartAgent = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) {
      addLog('system', "未找到活动页面，无法启动 Agent。", true);
      return;
    }
    if (!agentGoal.trim()) return;
    if (isAgentRunning) return;

    setIsAgentRunning(true);
    setRuntimeStats(null);
    stepCounterRef.current = 0;
    totalTokensRef.current = 0;
    streamTotalTokensRef.current = 0;
    addLog('user', agentGoal);
    addLog('agent', "初始化 Agent 并连接页面...");

    try { await cdp.attach(targetTabId); } catch (e) {}

    setAgentGoal(""); 

    orchestrator.runInCurrentTab({
      tabId: targetTabId,
      goal: agentGoal,
      memory: new LocalMemoryProvider(), // Use local memory by default for robustness
      onLog: (msg: string) => addLog('agent', msg),
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
        addAgentLogs(formatStepLogs({ ...step, runtime: nextRuntime }));
      },
      onFinish: (result: any) => {
        setIsAgentRunning(false);
        const total = streamTotalTokensRef.current || totalTokensRef.current;
        const tokenStr = total > 0 ? ` · 总计 ${total} tokens` : '';
        addLog('system', `✅ 任务执行完毕！${tokenStr}`, false, true);
        setCurrentAgent(null);
      },
      onError: (err: any) => {
        setIsAgentRunning(false);
        addLog('system', `❌ 任务失败: ${err.message}`, true);
        setCurrentAgent(null);
      },
      onHumanRequest: (req: HumanRequest) => {
        setHumanRequest(req);
        setIsAgentRunning(false);
        addLog('system', `[人工确认] 等待授权: ${req.message}`);
      }
    }).catch((err: any) => {
      console.error("Agent start error:", err);
      setIsAgentRunning(false);
      addLog('system', `❌ 运行异常: ${err.message}`, true);
      setCurrentAgent(null);
    });
  };

  const handleToggleStep = (stepId: number) => {
    setLogs(prev => prev.map(l =>
      l.sender === 'step' && (l as StepLog).stepId === stepId
        ? { ...l as StepLog, isCollapsed: !(l as StepLog).isCollapsed }
        : l
    ));
  };

  const handleStopAgent = () => {
    if (currentAgent) {
      currentAgent.stop();
      setIsAgentRunning(false);
      setCurrentAgent(null);
      setHumanRequest(null);
      addLog('system', "⚠️ 任务已被用户终止。");
    }
  };

  const handleHumanResponse = async (confirmed: boolean) => {
    if (!currentAgent) return;
    setHumanRequest(null);
    setIsAgentRunning(true);
    addLog('user', confirmed ? "✅ 允许执行" : "❌ 拒绝执行");
    await currentAgent.resume({ confirmed });
  };

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
