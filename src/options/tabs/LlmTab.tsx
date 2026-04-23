import React, { useState, useEffect } from 'react';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { loadDynamicConfig } from '../../shared/constants/env';
import { loadUiPreferences, saveUiPreferences } from '../../shared/storage/ui-preferences';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const LlmTab: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [enableDocLogger, setEnableDocLogger] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['llmConfig'], (result) => {
      const conf = result.llmConfig || {};
      setApiKey(conf.VITE_LLM_API_KEY || '');
      setBaseUrl(conf.VITE_LLM_BASE_URL || '');
      setModel(conf.VITE_LLM_MODEL || '');
    });
    loadUiPreferences()
      .then((prefs) => {
        setShowDebugLogs(prefs.showDebugLogs);
        setEnableDocLogger(prefs.enableDocLogger);
      })
      .catch((error) => console.warn('[Options] Failed to load UI preferences:', error));
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const conf = {
        VITE_LLM_API_KEY: apiKey.trim(),
        VITE_LLM_BASE_URL: baseUrl.trim(),
        VITE_LLM_MODEL: model.trim(),
      };
      await chrome.storage.local.set({ llmConfig: conf });
      await saveUiPreferences({ showDebugLogs, enableDocLogger });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || '保存失败');
    }
  };

  return (
    <div>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>全局大模型配置</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          配置你的 OpenAI 兼容接口，供 CoTabor 的规划器与执行器使用。若留空则使用默认的环境变量配置。
        </p>

        <div style={sectionBox}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>API Key (例如: sk-...)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入 API 密钥"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>Base URL (例如: https://api.openai.com/v1)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="请输入接口地址"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>Model Name (例如: gpt-4o)</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="请输入模型名称"
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            style={{ ...btn('#2563eb', status === 'saving'), width: '100%', padding: '10px' }}
          >
            {status === 'saving' ? '保存中...' : '保存大模型配置'}
          </button>

          {status === 'success' && <p style={{ color: '#10b981', fontSize: '14px', marginTop: '12px' }}>✅ 配置已保存成功！</p>}
          {status === 'error' && <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '12px' }}>❌ {errorMsg}</p>}
        </div>
      </div>

      <div style={{ ...card, marginTop: '16px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>运行日志文档</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          开启后，每次 Agent 运行时自动在飞书或 Notion 中创建运行日志文档，记录 LLM 对话、执行步骤及页面操作截图。需提前在存储设置中配置后端。
        </p>
        <div style={sectionBox}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>保存运行日志文档</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                将每次任务的完整执行记录（含 LLM 输入输出、审计结果、页面截图）保存至飞书或 Notion。默认关闭。
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableDocLogger}
              onChange={(e) => setEnableDocLogger(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
            />
          </label>
        </div>
      </div>

      <div style={{ ...card, marginTop: '16px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>侧边栏调试</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          默认隐藏底层 Agent 运行日志，避免普通使用时主界面过于嘈杂。开启后可在侧边栏中观测技术日志，便于调试工作流。
        </p>

        <div style={sectionBox}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>显示调试日志</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                开启后，侧边栏会显示底层 Agent 技术日志；关闭时仅保留聊天结果与工作流主视图。
              </div>
            </div>
            <input
              type="checkbox"
              checked={showDebugLogs}
              onChange={(e) => setShowDebugLogs(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default LlmTab;
