import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { loadDynamicConfig } from '../../shared/constants/env';
import { loginWithOpenRouter, fetchOpenRouterModels, OPENROUTER_BASE_URL } from '../../shared/utils/openrouter-auth';
import { ModelInfo } from '../../shared/types/openrouter';
import { Button, Select, Tag, Alert, message, Divider, Switch } from 'antd';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const LlmTab: React.FC = () => {
  const { t } = useTranslation('options');
  const [provider, setProvider] = useState('custom');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // OpenRouter state
  const [isOpenRouter, setIsOpenRouter] = useState(false);
  const [openRouterModels, setOpenRouterModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [savedOpenRouterKey, setSavedOpenRouterKey] = useState('');

  // Vision model (Midscene) state
  const [midsenseEnabled, setMidsenseEnabled] = useState(false);
  const [midsenseApiKey, setMidsenseApiKey] = useState('');
  const [midsenseBaseUrl, setMidsenseBaseUrl] = useState('');
  const [midsenseModel, setMidsenseModel] = useState('ui-tars-7b');

  useEffect(() => {
    chrome.storage.local.get(['llmConfig', 'openRouterKey', 'midsenseConfig'], (result) => {
      const conf = result.llmConfig || {};
      const loadedApiKey = conf.VITE_LLM_API_KEY || '';
      const loadedBaseUrl = conf.VITE_LLM_BASE_URL || '';
      
      setApiKey(loadedApiKey);
      setBaseUrl(loadedBaseUrl);
      setModel(conf.VITE_LLM_MODEL || '');
      setSavedOpenRouterKey(result.openRouterKey || '');

      const mc = result.midsenseConfig || {};
      if (mc.VITE_MIDSENSE_API_KEY) {
        setMidsenseEnabled(true);
        setMidsenseApiKey(mc.VITE_MIDSENSE_API_KEY);
        setMidsenseBaseUrl(mc.VITE_MIDSENSE_BASE_URL || '');
        setMidsenseModel(mc.VITE_MIDSENSE_MODEL || 'ui-tars-7b');
      }

      if (loadedBaseUrl.includes('openrouter.ai')) {
        setProvider('openrouter');
        setIsOpenRouter(true);
      } else if (loadedBaseUrl.includes('deepseek.com')) {
        setProvider('deepseek');
      } else if (loadedBaseUrl.includes('api.openai.com')) {
        setProvider('openai');
      } else {
        setProvider('custom');
      }
    });
  }, []);

  // Fetch OpenRouter models when URL is OpenRouter
  useEffect(() => {
    if (isOpenRouter) {
      setLoadingModels(true);
      fetchOpenRouterModels()
        .then((models) => {
          setOpenRouterModels(models);
        })
        .finally(() => setLoadingModels(false));
    }
  }, [isOpenRouter]);

  // Sync OpenRouter toggle with baseUrl changes
  useEffect(() => {
    setIsOpenRouter(baseUrl.includes('openrouter.ai'));
  }, [baseUrl]);

  const handleProviderChange = (val: string) => {
    setProvider(val);
    setModel(''); // 清空旧的模型名称，因为各家厂商的模型名称不通用
    
    if (val === 'openrouter') {
      setBaseUrl(OPENROUTER_BASE_URL);
      if (savedOpenRouterKey) setApiKey(savedOpenRouterKey);
    } else if (val === 'deepseek') {
      setBaseUrl('https://api.deepseek.com/v1');
      if (baseUrl.includes('openrouter.ai')) setApiKey('');
    } else if (val === 'openai') {
      setBaseUrl('https://api.openai.com/v1');
      if (baseUrl.includes('openrouter.ai')) setApiKey('');
    } else if (val === 'custom') {
      // 切换到自定义时，也清空 apiKey 以防串台，除非用户想保留
      if (baseUrl.includes('openrouter.ai')) setApiKey('');
    }
  };

  const handleOpenRouterLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg('');
    try {
      const key = await loginWithOpenRouter();
      setApiKey(key);
      setBaseUrl(OPENROUTER_BASE_URL);
      setProvider('openrouter');
      setIsOpenRouter(true);
      setSavedOpenRouterKey(key);
      await chrome.storage.local.set({ openRouterKey: key });
      message.success('授权成功！请在下方选择模型后点击"保存"。');
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'OpenRouter 授权失败');
    } finally {
      setIsLoggingIn(false);
    }
  };

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
      if (provider === 'openrouter') {
        await chrome.storage.local.set({ openRouterKey: apiKey.trim() });
        setSavedOpenRouterKey(apiKey.trim());
      }
      if (midsenseEnabled && midsenseApiKey.trim()) {
        await chrome.storage.local.set({
          midsenseConfig: {
            VITE_MIDSENSE_API_KEY: midsenseApiKey.trim(),
            VITE_MIDSENSE_BASE_URL: midsenseBaseUrl.trim(),
            VITE_MIDSENSE_MODEL: midsenseModel.trim() || 'ui-tars-7b',
          },
        });
      } else {
        await chrome.storage.local.remove('midsenseConfig');
      }
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || t('llm.saveFailed'));
    }
  };

  const modelOptions = useMemo(() => {
    return openRouterModels.map((m) => {
      const isFree = m.pricing?.prompt === '0' && m.pricing?.completion === '0';
      return {
        value: m.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>{m.name}</span>
            {isFree && <Tag color="success">免费 (Free)</Tag>}
          </div>
        ),
        searchLabel: m.name,
      };
    });
  }, [openRouterModels]);

  return (
    <div>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{t('llm.title')}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          {t('llm.description')}
        </p>

        <div style={sectionBox}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>模型提供方 (Provider)</label>
            <Select
              value={provider}
              onChange={handleProviderChange}
              style={{ width: '100%', height: '38px' }}
              options={[
                { value: 'openrouter', label: 'OpenRouter (推荐)' },
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'custom', label: '自定义 (Custom)' },
              ]}
            />
          </div>

          {provider === 'openrouter' && !apiKey && (
            <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginTop: 0, marginBottom: '8px' }}>🚀 快速入门：OpenRouter 授权一键使用</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                无需手动配置 API Key，点击下方按钮通过 OpenRouter 安全授权登录，自动获取支持图像、文本输入与结构化输出的优质模型列表。
              </p>
              <Button 
                type="primary" 
                onClick={handleOpenRouterLogin} 
                loading={isLoggingIn}
                style={{ backgroundColor: '#18181b' }}
              >
                使用 OpenRouter 登录
              </Button>
            </div>
          )}

          {provider === 'openrouter' && apiKey && (
            <Alert 
              message="✅ 已通过 OpenRouter 授权" 
              type="success" 
              showIcon 
              style={{ marginBottom: '16px' }} 
              action={
                <Button size="small" onClick={handleOpenRouterLogin} loading={isLoggingIn}>
                  重新授权
                </Button>
              } 
            />
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>{t('llm.baseUrl.label')}</label>
            <input
              type="text"
              value={baseUrl}
              readOnly={provider !== 'custom'}
              onClick={() => {
                if (provider !== 'custom') {
                  message.info('如需手动修改 Base URL，请先在上方将“模型提供方”切换为“自定义 (Custom)”');
                }
              }}
              onChange={(e) => {
                if (provider === 'custom') {
                  setBaseUrl(e.target.value);
                }
              }}
              placeholder={t('llm.baseUrl.placeholder')}
              style={{
                ...inputStyle,
                backgroundColor: provider !== 'custom' ? '#f3f4f6' : '#fff',
                color: provider !== 'custom' ? '#9ca3af' : '#000',
                cursor: provider !== 'custom' ? 'not-allowed' : 'text'
              }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>{t('llm.apiKey.label')}</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('llm.apiKey.placeholder')}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>{t('llm.model.label')}</label>
            {isOpenRouter ? (
              <Select
                showSearch
                style={{ width: '100%', height: '38px' }}
                placeholder="请选择模型 (Select a model)"
                value={model || undefined}
                onChange={(val) => setModel(val)}
                loading={loadingModels}
                options={modelOptions}
                optionFilterProp="searchLabel"
              />
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('llm.model.placeholder')}
                style={inputStyle}
              />
            )}
          </div>
          <Divider style={{ margin: '20px 0 12px' }} />
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>视觉感知模型 (Vision)</label>
              <Switch size="small" checked={midsenseEnabled} onChange={setMidsenseEnabled} />
            </div>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>
              用于视觉恢复功能 (Cortex)，当主模型无法定位页面元素时自动触发，支持 UI-TARS、Qwen-VL 等视觉模型。
            </p>
            {midsenseEnabled && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>API Key</label>
                  <input
                    type="password"
                    value={midsenseApiKey}
                    onChange={(e) => setMidsenseApiKey(e.target.value)}
                    placeholder="视觉模型 API Key"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>Base URL <span style={{ color: '#9ca3af', fontWeight: 400 }}>(选填)</span></label>
                  <input
                    type="text"
                    value={midsenseBaseUrl}
                    onChange={(e) => setMidsenseBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#374151' }}>Model</label>
                  <input
                    type="text"
                    value={midsenseModel}
                    onChange={(e) => setMidsenseModel(e.target.value)}
                    placeholder="ui-tars-7b"
                    style={inputStyle}
                  />
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            style={{ ...btn('#2563eb', status === 'saving'), width: '100%', padding: '10px' }}
          >
            {status === 'saving' ? t('llm.saving') : t('llm.save')}
          </button>

          {status === 'success' && <p style={{ color: '#10b981', fontSize: '14px', marginTop: '12px' }}>{t('llm.saveSuccess')}</p>}
          {status === 'error' && <Alert type="error" message={errorMsg} style={{ marginTop: '12px' }} />}
        </div>
      </div>
    </div>
  );
};

export default LlmTab;
