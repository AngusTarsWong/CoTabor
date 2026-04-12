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

const SIDEPANEL_VERSION = "debug-2026.03.26-05-modern-ui";

const App: React.FC = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [logs, setLogs] = useState<{ sender: 'user' | 'agent' | 'system', text: string, isError?: boolean, isSuccess?: boolean }[]>([]);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [boundTabId, setBoundTabId] = useState<number | null>(null);
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
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

    return lines;
  };

  const refreshActiveTabId = async (): Promise<number | null> => {
    const activeId = await new Promise<number | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id ?? null);
      });
    });
    if (activeId) {
      setTabId(activeId);
      return activeId;
    }
    return null;
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] ?? null);
      });
    });
    return tab;
  };

  const bindCurrentPage = async (): Promise<number | null> => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      addLog('system', "错误：无法绑定，未找到当前页面。", true);
      return null;
    }
    const url = tab.url ?? "";
    await chrome.storage.local.set({ boundTabId: tab.id, boundTabUrl: url });
    setBoundTabId(tab.id);
    setBoundTabUrl(url);
    addLog('system', `已绑定页面: ${tab.title || url}`, false, true);
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
    chrome.storage.local.get(["boundTabId", "boundTabUrl"]).then((result) => {
      if (result.boundTabId) {
        setBoundTabId(result.boundTabId as number);
        setBoundTabUrl((result.boundTabUrl as string) || "");
      }
    });

    const onActivated = () => refreshActiveTabId().catch(() => {});
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && changeInfo.status === "complete") refreshActiveTabId().catch(() => {});
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    const onMsg = (msg: any) => {
      if (msg && msg.type === "TRACE_EVENT" && msg.data) {
        setTraceEvents((prev) => [...prev, msg.data as TraceEvent]);
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
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
    addLog('user', agentGoal);
    addLog('agent', "初始化 Agent 并连接页面...");

    try { await cdp.attach(targetTabId); } catch (e) {}

    setAgentGoal(""); 

    orchestrator.runInCurrentTab({
      tabId: targetTabId,
      goal: agentGoal,
      onLog: (msg: string) => addLog('agent', msg),
      onStep: (step: any) => addAgentLogs(formatStepLogs(step)),
      onFinish: (result: any) => {
        setIsAgentRunning(false);
        addLog('system', "✅ 任务执行完毕！", false, true);
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
        showDebug={showDebug} 
        setShowDebug={setShowDebug} 
        openOptions={openOptions} 
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