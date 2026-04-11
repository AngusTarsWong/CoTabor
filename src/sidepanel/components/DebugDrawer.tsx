import React from 'react';

interface DebugDrawerProps {
  version: string;
  activeDebugTab: 'browser' | 'skills';
  setActiveDebugTab: (tab: 'browser' | 'skills') => void;
  boundTabUrl: string;
  handleBindCurrentPage: () => void;
  handleAttach: () => void;
  handleDetach: () => void;
  handleScan: () => void;
  targetId: string;
  setTargetId: (id: string) => void;
  handleClick: () => void;
  inputText: string;
  setInputText: (text: string) => void;
  handleType: () => void;
  testFeishuApi: () => void;
  testVectorization: () => void;
  skillTestLog: string;
}

export const DebugDrawer: React.FC<DebugDrawerProps> = ({
  version,
  activeDebugTab,
  setActiveDebugTab,
  boundTabUrl,
  handleBindCurrentPage,
  handleAttach,
  handleDetach,
  handleScan,
  targetId,
  setTargetId,
  handleClick,
  inputText,
  setInputText,
  handleType,
  testFeishuApi,
  testVectorization,
  skillTestLog
}) => {
  return (
    <div style={{ backgroundColor: "#1e293b", color: "#f8fafc", padding: "16px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "12px", borderBottom: "1px solid #0f172a", boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setActiveDebugTab('browser')} style={{ padding: "4px 8px", background: activeDebugTab === 'browser' ? "#3b82f6" : "transparent", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Browser DOM</button>
          <button onClick={() => setActiveDebugTab('skills')} style={{ padding: "4px 8px", background: activeDebugTab === 'skills' ? "#3b82f6" : "transparent", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Skills & API</button>
        </div>
        <span style={{ color: "#94a3b8", fontSize: "11px" }}>{version}</span>
      </div>

      {activeDebugTab === 'browser' && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={handleBindCurrentPage} style={{ padding: "4px 10px", background: "#475569", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Bind Page</button>
            <span style={{ color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{boundTabUrl || "No page bound"}</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleAttach} style={{ padding: "4px 10px", background: "#475569", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Attach</button>
            <button onClick={handleDetach} style={{ padding: "4px 10px", background: "#475569", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Detach</button>
            <button onClick={handleScan} style={{ padding: "4px 10px", background: "#10b981", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Scan DOM</button>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="number" placeholder="Element ID" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: "80px", padding: "4px", borderRadius: "4px", border: "none", background: "#334155", color: "white" }} />
            <button onClick={handleClick} style={{ padding: "4px 10px", background: "#475569", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Click</button>
            <input type="text" placeholder="Type text..." value={inputText} onChange={(e) => setInputText(e.target.value)} style={{ flex: 1, padding: "4px", borderRadius: "4px", border: "none", background: "#334155", color: "white" }} />
            <button onClick={handleType} style={{ padding: "4px 10px", background: "#475569", border: "none", color: "white", borderRadius: "4px", cursor: "pointer" }}>Type</button>
          </div>
        </div>
      )}

      {activeDebugTab === 'skills' && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
           <div style={{ display: "flex", gap: "8px" }}>
             <button onClick={testFeishuApi} style={{ padding: "6px 12px", background: "#0ea5e9", border: "none", color: "white", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}>
               🟢 测试飞书连接
             </button>
             <button onClick={testVectorization} style={{ padding: "6px 12px", background: "#8b5cf6", border: "none", color: "white", borderRadius: "4px", cursor: "pointer", fontWeight: 500 }}>
               🟣 测试火山向量化
             </button>
           </div>
        </div>
      )}

      <div style={{ marginTop: "8px", padding: "8px", background: "#0f172a", borderRadius: "6px", fontFamily: "monospace", minHeight: "40px", maxHeight: "100px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
        <span style={{ color: "#64748b" }}>&gt; Debug Log:</span><br/>
        {skillTestLog || "Ready."}
      </div>
    </div>
  );
};
