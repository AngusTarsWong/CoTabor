import React, { useState, useEffect } from "react";
import { cdp, dom, act, ElementInfo } from "../lib/claw";

const App: React.FC = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");

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

  return (
    <div style={{ padding: "16px", fontFamily: "sans-serif", fontSize: "14px" }}>
      <h2>CoTabor Debugger</h2>
      
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

      <div style={{ marginBottom: "10px", display: "flex", gap: "8px" }}>
        <input 
          type="text" 
          placeholder="Type text..." 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{ width: "120px" }}
        />
        <button onClick={handleType}>Type</button>
      </div>

      <div style={{ 
        border: "1px solid #ccc", 
        padding: "8px", 
        height: "150px", 
        overflowY: "auto", 
        marginBottom: "10px",
        background: "#f5f5f5"
      }}>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: "4px" }}>{log}</div>
        ))}
      </div>

      <div style={{ maxHeight: "300px", overflowY: "auto" }}>
        <h4>Elements ({elements.length})</h4>
        {elements.slice(0, 50).map((el) => (
          <div key={el.id} style={{ 
            padding: "4px", 
            borderBottom: "1px solid #eee",
            fontSize: "12px",
            cursor: "pointer",
            background: targetId === String(el.id) ? "#e6f7ff" : "transparent"
          }} onClick={() => setTargetId(String(el.id))}>
            <strong>[{el.id}]</strong> {el.tagName} 
            {el.text ? `: "${el.text}"` : ""} 
            <span style={{ color: "#999" }}> ({Math.round(el.rect.x)},{Math.round(el.rect.y)})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
