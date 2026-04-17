import React, { useState, useEffect } from 'react';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { loadDynamicConfig } from '../../shared/constants/env';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const LlmTab: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['llmConfig'], (result) => {
      const conf = result.llmConfig || {};
      setApiKey(conf.VITE_LLM_API_KEY || '');
      setBaseUrl(conf.VITE_LLM_BASE_URL || '');
      setModel(conf.VITE_LLM_MODEL || '');
    });
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
    </div>
  );
};

export default LlmTab;
