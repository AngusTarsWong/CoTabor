import React, { useState } from 'react';
import { loadDynamicConfig } from '../shared/constants/env';

import LlmTab    from './tabs/LlmTab';
import FeishuTab from './tabs/FeishuTab';
import NotionTab from './tabs/NotionTab';
import McpTab    from './tabs/McpTab';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

// ─── Root App ─────────────────────────────────────────────────────────────────

type Tab = 'feishu' | 'notion' | 'mcp' | 'llm';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('notion');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    borderBottom: activeTab === t ? '2px solid #2563eb' : '2px solid transparent',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#2563eb' : '#6b7280',
    fontSize: '15px',
    transition: 'color .15s',
  });

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>🧠 CoTabor AI 设置</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>管理 AI 记忆后端与外部工具集成</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle('notion')} onClick={() => setActiveTab('notion')}>📝 Notion 设置</button>
        <button style={tabStyle('feishu')} onClick={() => setActiveTab('feishu')}>🪁 飞书设置</button>
        <button style={tabStyle('llm')}    onClick={() => setActiveTab('llm')}>🤖 大模型配置</button>
        <button style={tabStyle('mcp')}    onClick={() => setActiveTab('mcp')}>🔌 MCP 服务器</button>
      </div>

      {activeTab === 'notion' && <NotionTab />}
      {activeTab === 'feishu' && <FeishuTab />}
      {activeTab === 'llm'    && <LlmTab />}
      {activeTab === 'mcp'    && <McpTab />}
    </div>
  );
};

export default App;
