import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { loadDynamicConfig } from '../../shared/constants/env';
import { loadUiPreferences, saveUiPreferences } from '../../shared/storage/ui-preferences';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const LlmTab: React.FC = () => {
  const { t } = useTranslation('options');
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
      setErrorMsg(err.message || t('llm.saveFailed'));
    }
  };

  return (
    <div>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{t('llm.title')}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          {t('llm.description')}
        </p>

        <div style={sectionBox}>
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
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>{t('llm.baseUrl.label')}</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t('llm.baseUrl.placeholder')}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>{t('llm.model.label')}</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t('llm.model.placeholder')}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            style={{ ...btn('#2563eb', status === 'saving'), width: '100%', padding: '10px' }}
          >
            {status === 'saving' ? t('llm.saving') : t('llm.save')}
          </button>

          {status === 'success' && <p style={{ color: '#10b981', fontSize: '14px', marginTop: '12px' }}>{t('llm.saveSuccess')}</p>}
          {status === 'error' && <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '12px' }}>❌ {errorMsg}</p>}
        </div>
      </div>

      <div style={{ ...card, marginTop: '16px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{t('llm.docLogger.title')}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          {t('llm.docLogger.description')}
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
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>{t('llm.docLogger.label')}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                {t('llm.docLogger.detail')}
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
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{t('llm.debug.title')}</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
          {t('llm.debug.description')}
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
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>{t('llm.debug.label')}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                {t('llm.debug.detail')}
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
