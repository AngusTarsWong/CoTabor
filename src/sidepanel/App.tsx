import React, { useState, useEffect } from "react";
import { cdp, dom, act, ElementInfo, ClawAgent } from "../lib/claw";

const App: React.FC = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  
  // Agent State
  const [agentGoal, setAgentGoal] = useState<string>("Go to Google News and read the latest tech news, then summarize it.");
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [currentAgent, setCurrentAgent] = useState<ClawAgent | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  useEffect(() => {
    // Get current tab on mount
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        setTabId(tabs[0].id);
        addLog(`Current Tab ID: ${tabs[0].id}`);
      }
    });
  }, []);

  const handleAttach = async () => {
    if (!tabId) return;
    try {
      await cdp.attach(tabId);
      addLog("Attached to debugger");
    } catch (e: any) {
      addLog(`Attach failed: ${e.message}`);
    }
  };

  const handleDetach = async () => {
    if (!tabId) return;
    await cdp.detach(tabId);
    addLog("Detached debugger");
  };

  const handleScan = async () => {
    if (!tabId) return;
    try {
      const els = await dom.scan(tabId);
      setElements(els);
      addLog(`Scanned ${els.length} elements`);
      console.log(els); // For debugging in console
    } catch (e: any) {
      addLog(`Scan failed: ${e.message}`);
    }
  };

  const handleClick = async () => {
    if (!tabId || !targetId) return;
    const el = elements.find((e) => e.id === Number(targetId));
    if (!el) {
      addLog(`Element ${targetId} not found in scan results`);
      return;
    }

    try {
      // Click center of element
      const x = el.rect.x + el.rect.width / 2;
      const y = el.rect.y + el.rect.height / 2;
      await act.click(tabId, x, y);
      addLog(`Clicked element ${targetId} at (${Math.round(x)}, ${Math.round(y)})`);
    } catch (e: any) {
      addLog(`Click failed: ${e.message}`);
    }
  };

  const handleType = async () => {
    if (!tabId || !inputText) return;
    try {
      await act.type(tabId, inputText);
      addLog(`Typed: "${inputText}"`);
    } catch (e: any) {
      addLog(`Type failed: ${e.message}`);
    }
  };

  // --- Agent Controls ---
  const handleStartAgent = async () => {
    if (!tabId) {
      addLog("Error: No Tab ID found. Cannot start agent.");
      return;
    }
    if (!agentGoal) {
      addLog("Error: Please enter a goal for the agent.");
      return;
    }

    if (isAgentRunning) {
      addLog("Agent is already running.");
      return;
    }

    setIsAgentRunning(true);
    addLog("Initializing Agent...");

    // Ensure attached first
    try {
      await cdp.attach(tabId);
    } catch (e) {
      // ignore attach error
    }

    const agent = new ClawAgent({
      tabId,
      goal: agentGoal,
      onLog: (msg) => addLog(`[Agent] ${msg}`),
      onStep: (step) => {
        console.log("Agent Step:", step);
      },
      onFinish: (result) => {
        setIsAgentRunning(false);
        addLog("Agent Task Finished!");
        setCurrentAgent(null);
      },
      onError: (err) => {
        setIsAgentRunning(false);
        addLog(`Agent Error: ${err.message}`);
        setCurrentAgent(null);
      }
    });

    setCurrentAgent(agent);
    
    // Start asynchronously
    agent.start().catch(err => {
      console.error("Agent start error:", err);
      setIsAgentRunning(false);
    });
  };

  const handleStopAgent = () => {
    if (currentAgent) {
      currentAgent.stop();
      setIsAgentRunning(false);
      setCurrentAgent(null);
      addLog("Agent stopped by user.");
    }
  };

  return (
    <div style={{ padding: "16px", fontFamily: "sans-serif", fontSize: "14px", display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box" }}>
      <h2>CoTabor Debugger</h2>
      
      {/* Debugger Tools */}
      <div style={{ marginBottom: "15px", padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}>
        <h3>Manual Tools</h3>
        <div style={{ marginBottom: "10px", display: "flex", gap: "8px" }}>
          <button onClick={handleAttach}>Attach</button>
          <button onClick={handleDetach}>Detach</button>
          <button onClick={handleScan}>Scan Page</button>
        </div>

        <div style={{ marginBottom: "10px", display: "flex", gap: "8px" }}>
          <input 
            type="number" 
            placeholder="Element ID" 
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            style={{ width: "80px" }}
          />
          <button onClick={handleClick}>Click ID</button>
        </div>
        
        <div style={{ display: "flex", gap: "8px" }}>
           <input 
            type="text" 
            placeholder="Type text..." 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={handleType}>Type</button>
        </div>
      </div>

      {/* Agent UI */}
      <div style={{ marginBottom: "15px", padding: "10px", border: "2px solid #007bff", borderRadius: "4px", backgroundColor: "#f0f7ff" }}>
        <h3>Agent Brain</h3>
        <textarea
          value={agentGoal}
          onChange={(e) => setAgentGoal(e.target.value)}
          placeholder="What should I do?"
          style={{ width: "100%", height: "60px", marginBottom: "8px", padding: "8px", boxSizing: "border-box" }}
          disabled={isAgentRunning}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          {!isAgentRunning ? (
            <button 
              onClick={handleStartAgent} 
              style={{ backgroundColor: "#28a745", color: "white", padding: "8px 16px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              Start Agent
            </button>
          ) : (
            <button 
              onClick={handleStopAgent} 
              style={{ backgroundColor: "#dc3545", color: "white", padding: "8px 16px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
            >
              Stop Agent
            </button>
          )}
        </div>
      </div>

      {/* Logs */}
      <div style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px" }}>
        {logs.length === 0 && <div style={{ color: "#888" }}>Logs will appear here...</div>}
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: "4px", borderBottom: "1px solid #eee", paddingBottom: "2px" }}>{log}</div>
        ))}
      </div>
    </div>
  );
};

export default App;
