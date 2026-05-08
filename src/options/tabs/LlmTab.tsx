import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { loadDynamicConfig } from '../../shared/constants/env';
import { loginWithOpenRouter, fetchOpenRouterModels, OPENROUTER_BASE_URL } from '../../shared/utils/openrouter-auth';
import { ModelInfo } from '../../shared/types/openrouter';
import { Button, Select, Tag, Alert, message, Divider, Switch, Checkbox, Card, Typography, Input, Space } from 'antd';
import { RocketOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { MIDSCENE_MODEL_FAMILY_OPTIONS, inferMidsceneModelFamily } from '../../drivers/midscene/model-config';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const { Title, Text, Paragraph } = Typography;

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter (推荐)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: '自定义 (Custom)' },
];

function inferProvider(baseUrl: string): string {
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('deepseek.com')) return 'deepseek';
  if (baseUrl.includes('api.openai.com')) return 'openai';
  return 'custom';
}

function providerLabel(val: string): string {
  return PROVIDER_OPTIONS.find(o => o.value === val)?.label ?? val;
}

function baseUrlForProvider(val: string): string {
  if (val === 'openrouter') return OPENROUTER_BASE_URL;
  if (val === 'deepseek') return 'https://api.deepseek.com/v1';
  if (val === 'openai') return 'https://api.openai.com/v1';
  return '';
}

const MIDSCENE_MODEL_FAMILY_AUTO = '__auto__';
const MIDSCENE_MODEL_FAMILY_EMPTY = '__empty__';

const MIDSCENE_MODEL_FAMILY_DESCRIPTIONS: Record<string, string> = {
  'qwen3-vl': 'Qwen3-VL',
  'qwen2.5-vl': 'Qwen2.5-VL',
  'qwen3.5': 'Qwen3.5 / Qwen3.6',
  'doubao-vision': 'Doubao Vision',
  'doubao-seed': 'Doubao Seed',
  gemini: 'Gemini vision models',
  'vlm-ui-tars': 'UI-TARS 1.0',
  'vlm-ui-tars-doubao': 'UI-TARS 1.5 on Volcano Engine',
  'vlm-ui-tars-doubao-1.5': 'UI-TARS 1.5 on Volcano Engine',
  'glm-v': 'Zhipu GLM-V',
  'auto-glm': 'AutoGLM Phone 9B',
  'auto-glm-multilingual': 'AutoGLM Phone 9B Multilingual',
  'gpt-5': 'GPT-5 series',
};

function buildMidsceneDocs(language: string) {
  const normalized = language.toLowerCase();
  const useChineseDocs = normalized.startsWith('zh');
  const baseUrl = useChineseDocs ? 'https://midscenejs.com/zh' : 'https://midscenejs.com';
  return {
    languageLabel: useChineseDocs ? '中文' : 'English',
    isChinese: useChineseDocs,
    modelConfigUrl: `${baseUrl}/model-config`,
    commonConfigUrl: `${baseUrl}/model-common-config`,
  };
}

const LlmTab: React.FC = () => {
  const { t, i18n } = useTranslation('options');

  // --- Main LLM state ---
  const [provider, setProvider] = useState('custom');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // OpenRouter shared state
  const [openRouterModels, setOpenRouterModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [savedOpenRouterKey, setSavedOpenRouterKey] = useState('');
  const [mainOnlyVision, setMainOnlyVision] = useState(false);

  // --- Vision model (Midscene) state ---
  const [midsenseEnabled, setMidsenseEnabled] = useState(false);
  const [midsenseInherit, setMidsenseInherit] = useState(false);
  const [visionProvider, setVisionProvider] = useState('custom');
  const [midsenseApiKey, setMidsenseApiKey] = useState('');
  const [midsenseBaseUrl, setMidsenseBaseUrl] = useState('');
  const [midsenseModel, setMidsenseModel] = useState('');
  const [midsenseModelFamily, setMidsenseModelFamily] = useState(MIDSCENE_MODEL_FAMILY_AUTO);
  const [isVisionLoggingIn, setIsVisionLoggingIn] = useState(false);
  const [visionLoadingModels, setVisionLoadingModels] = useState(false);

  const isOpenRouter = provider === 'openrouter';
  const isVisionOpenRouter = visionProvider === 'openrouter';
  const midsceneDocs = useMemo(
    () => buildMidsceneDocs(i18n.resolvedLanguage || i18n.language || 'en'),
    [i18n.resolvedLanguage, i18n.language],
  );

  useEffect(() => {
    chrome.storage.local.get(['llmConfig', 'openRouterKey', 'midsenseConfig'], (result) => {
      const conf = result.llmConfig || {};
      const loadedBaseUrl = conf.VITE_LLM_BASE_URL || '';
      setApiKey(conf.VITE_LLM_API_KEY || '');
      setBaseUrl(loadedBaseUrl);
      setModel(conf.VITE_LLM_MODEL || '');
      setProvider(inferProvider(loadedBaseUrl));
      setSavedOpenRouterKey(result.openRouterKey || '');

      const mc = result.midsenseConfig || {};
      if (mc.VITE_MIDSENSE_API_KEY) {
        setMidsenseEnabled(true);
        if (mc.VITE_MIDSENSE_INHERIT === 'true') {
          setMidsenseInherit(true);
          // Inherit mode: actual values come from main config at save time; no need to restore fields
        } else {
          setMidsenseApiKey(mc.VITE_MIDSENSE_API_KEY);
          setMidsenseBaseUrl(mc.VITE_MIDSENSE_BASE_URL || '');
          setMidsenseModel(mc.VITE_MIDSENSE_MODEL || '');
          setMidsenseModelFamily(mc.VITE_MIDSENSE_MODEL_FAMILY || MIDSCENE_MODEL_FAMILY_AUTO);
          setVisionProvider(inferProvider(mc.VITE_MIDSENSE_BASE_URL || ''));
        }
      }
    });
  }, []);

  // Fetch OpenRouter models (shared list, fetched once)
  useEffect(() => {
    if (isOpenRouter || isVisionOpenRouter) {
      if (openRouterModels.length > 0) return;
      setLoadingModels(true);
      fetchOpenRouterModels()
        .then(setOpenRouterModels)
        .finally(() => setLoadingModels(false));
    }
  }, [isOpenRouter, isVisionOpenRouter]);

  // Vision loading flag mirrors shared loadingModels when vision is OR
  useEffect(() => {
    if (isVisionOpenRouter) setVisionLoadingModels(loadingModels);
  }, [isVisionOpenRouter, loadingModels]);

  const handleProviderChange = (val: string) => {
    setProvider(val);
    setModel('');
    const wasOpenRouter = baseUrl.includes('openrouter.ai');
    if (val === 'openrouter') {
      setBaseUrl(OPENROUTER_BASE_URL);
      if (savedOpenRouterKey) setApiKey(savedOpenRouterKey);
    } else {
      setBaseUrl(baseUrlForProvider(val));
      if (wasOpenRouter) setApiKey('');
    }
  };

  const handleVisionProviderChange = (val: string) => {
    setVisionProvider(val);
    setMidsenseModel('');
    const wasOpenRouter = midsenseBaseUrl.includes('openrouter.ai');
    if (val === 'openrouter') {
      setMidsenseBaseUrl(OPENROUTER_BASE_URL);
      if (savedOpenRouterKey) setMidsenseApiKey(savedOpenRouterKey);
    } else {
      setMidsenseBaseUrl(baseUrlForProvider(val));
      if (wasOpenRouter) setMidsenseApiKey('');
    }
  };

  const handleMidsenseInheritChange = (checked: boolean) => {
    setMidsenseInherit(checked);
    if (checked) {
      // Sync vision fields from current main config
      setVisionProvider(provider);
      setMidsenseApiKey(apiKey);
      setMidsenseBaseUrl(baseUrl);
      setMidsenseModel(model);
      setMidsenseModelFamily(MIDSCENE_MODEL_FAMILY_AUTO);
    }
  };

  // Whether the currently selected main model can handle image input (only checkable for OpenRouter)
  const inheritedModelSupportsVision = useMemo(() => {
    if (!midsenseInherit || !midsenseEnabled) return true;
    if (provider !== 'openrouter') return true; // can't validate non-OR models
    if (!model) return true; // no model chosen yet, defer validation
    if (openRouterModels.length === 0) return true; // list not loaded yet
    const info = openRouterModels.find((m) => m.id === model);
    if (!info) return true; // model not found in list
    return info.architecture?.input_modalities?.includes('image') ?? false;
  }, [midsenseInherit, midsenseEnabled, provider, model, openRouterModels]);

  const handleOpenRouterLogin = async (forVision = false) => {
    if (forVision) setIsVisionLoggingIn(true);
    else setIsLoggingIn(true);
    setErrorMsg('');
    try {
      const key = await loginWithOpenRouter();
      setSavedOpenRouterKey(key);
      await chrome.storage.local.set({ openRouterKey: key });

      if (forVision) {
        setMidsenseApiKey(key);
        setMidsenseBaseUrl(OPENROUTER_BASE_URL);
        setVisionProvider('openrouter');
      } else {
        setApiKey(key);
        setBaseUrl(OPENROUTER_BASE_URL);
        setProvider('openrouter');
      }
      message.success('授权成功！请在下方选择模型后点击"保存"。');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'OpenRouter 授权失败');
    } finally {
      if (forVision) setIsVisionLoggingIn(false);
      else setIsLoggingIn(false);
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      await chrome.storage.local.set({
        llmConfig: {
          VITE_LLM_API_KEY: apiKey.trim(),
          VITE_LLM_BASE_URL: baseUrl.trim(),
          VITE_LLM_MODEL: model.trim(),
        },
      });
      if (provider === 'openrouter') {
        await chrome.storage.local.set({ openRouterKey: apiKey.trim() });
        setSavedOpenRouterKey(apiKey.trim());
      }
      const effectiveVisionKey = midsenseInherit ? apiKey.trim() : midsenseApiKey.trim();
      const effectiveVisionModel = (midsenseInherit ? model : midsenseModel).trim() || 'ui-tars-7b';
      const effectiveVisionModelFamily = midsenseInherit
        ? inferMidsceneModelFamily(effectiveVisionModel)
        : (
            midsenseModelFamily === MIDSCENE_MODEL_FAMILY_AUTO
              ? inferMidsceneModelFamily(effectiveVisionModel)
              : midsenseModelFamily === MIDSCENE_MODEL_FAMILY_EMPTY
                ? ''
                : midsenseModelFamily.trim()
          );
      if (midsenseEnabled && effectiveVisionKey) {
        const nextMidsenseConfig: Record<string, string> = {
          ...(midsenseInherit ? { VITE_MIDSENSE_INHERIT: 'true' } : {}),
          VITE_MIDSENSE_API_KEY: effectiveVisionKey,
          VITE_MIDSENSE_BASE_URL: (midsenseInherit ? baseUrl : midsenseBaseUrl).trim(),
          VITE_MIDSENSE_MODEL: effectiveVisionModel,
        };
        if (effectiveVisionModelFamily) {
          nextMidsenseConfig.VITE_MIDSENSE_MODEL_FAMILY = effectiveVisionModelFamily;
        }
        await chrome.storage.local.set({
          midsenseConfig: nextMidsenseConfig,
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

  const mainModelOptions = useMemo(() => {
    let filtered = openRouterModels;
    if (mainOnlyVision) {
      filtered = filtered.filter(m => m.architecture?.input_modalities?.includes('image'));
    }
    return filtered.map((m) => {
      const isFree = m.pricing?.prompt === '0' && m.pricing?.completion === '0';
      const isVision = m.architecture?.input_modalities?.includes('image');
      return {
        value: m.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>{m.name}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {isVision && <Tag color="blue">视觉</Tag>}
              {isFree && <Tag color="success">免费 (Free)</Tag>}
            </div>
          </div>
        ),
        searchLabel: m.name,
      };
    });
  }, [openRouterModels, mainOnlyVision]);

  const visionModelOptions = useMemo(() => openRouterModels
    .filter((m) => m.architecture?.input_modalities?.includes('image'))
    .map((m) => {
      const isFree = m.pricing?.prompt === '0' && m.pricing?.completion === '0';
      return {
        value: m.id,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>{m.name}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Tag color="blue">视觉</Tag>
              {isFree && <Tag color="success">免费 (Free)</Tag>}
            </div>
          </div>
        ),
        searchLabel: m.name,
      };
    }), [openRouterModels]);

  const midsceneModelFamilyOptions = useMemo(
    () => [
      {
        value: MIDSCENE_MODEL_FAMILY_AUTO,
        label: `自动推荐 - 按 Model 名称推断（推荐）`,
      },
      {
        value: MIDSCENE_MODEL_FAMILY_EMPTY,
        label: `不指定 - 高级选项，可能导致视觉定位失败`,
      },
      ...MIDSCENE_MODEL_FAMILY_OPTIONS.map((value) => ({
        value,
        label: `${value} - ${MIDSCENE_MODEL_FAMILY_DESCRIPTIONS[value] ?? 'Official Midscene family'}`,
      })),
    ],
    [],
  );

  const readOnlyInputStyle = (isReadOnly: boolean) => ({
    ...inputStyle,
    backgroundColor: isReadOnly ? '#f3f4f6' : '#fff',
    color: isReadOnly ? '#9ca3af' : '#000',
    cursor: isReadOnly ? 'not-allowed' : 'text',
  });

  const renderOpenRouterBanner = (hasKey: boolean, onLogin: () => void, isLoading: boolean) => {
    if (!hasKey) {
      return (
        <Card type="inner" style={{ marginBottom: '16px', backgroundColor: '#f8fafc', borderStyle: 'dashed' }}>
          <Space align="center" style={{ marginBottom: '8px' }}>
            <RocketOutlined style={{ fontSize: '18px', color: '#18181b' }} />
            <Text strong style={{ fontSize: '14px', margin: 0 }}>快速入门：OpenRouter 授权一键使用</Text>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: '13px', marginBottom: '12px' }}>
            无需手动配置 API Key，点击下方按钮通过 OpenRouter 安全授权登录，自动获取模型列表。
          </Paragraph>
          <Button type="primary" onClick={onLogin} loading={isLoading} style={{ backgroundColor: '#18181b' }}>
            使用 OpenRouter 登录
          </Button>
        </Card>
      );
    }
    return (
      <Alert
        message={<Space><CheckCircleOutlined /> 已通过 OpenRouter 授权</Space>}
        type="success"
        style={{ marginBottom: '16px' }}
        action={<Button size="small" onClick={onLogin} loading={isLoading}>重新授权</Button>}
      />
    );
  };

  return (
    <Card bordered={false} style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: '16px' }}>{t('llm.title')}</Title>
      <Paragraph type="secondary" style={{ fontSize: '14px', marginBottom: '24px' }}>
        {t('llm.description')}
      </Paragraph>

      <Card type="inner" bordered={false} style={{ padding: 0, backgroundColor: 'transparent' }}>
        {/* ── 主模型配置 ── */}
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>模型提供方 (Provider)</Text>
          <Select
            value={provider}
            onChange={handleProviderChange}
            style={{ width: '100%' }}
            size="large"
            options={PROVIDER_OPTIONS}
          />
        </div>

        {isOpenRouter && renderOpenRouterBanner(!!apiKey, () => handleOpenRouterLogin(false), isLoggingIn)}

        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>{t('llm.baseUrl.label')}</Text>
          <Input
            value={baseUrl}
            readOnly={provider !== 'custom'}
            onClick={() => { if (provider !== 'custom') message.info('如需手动修改 Base URL，请先将"模型提供方"切换为"自定义 (Custom)"'); }}
            onChange={(e) => { if (provider === 'custom') setBaseUrl(e.target.value); }}
            placeholder={t('llm.baseUrl.placeholder')}
            size="large"
            style={{ backgroundColor: provider !== 'custom' ? '#f3f4f6' : '#fff' }}
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>{t('llm.apiKey.label')}</Text>
          <Input.Password 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)} 
            placeholder={t('llm.apiKey.placeholder')} 
            size="large"
          />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <Text strong style={{ fontSize: '14px' }}>{t('llm.model.label')}</Text>
            {isOpenRouter && (
              <Checkbox
                checked={mainOnlyVision}
                onChange={(e) => setMainOnlyVision(e.target.checked)}
                style={{ fontSize: '12px' }}
              >
                {t('llm.model.onlyVision')}
              </Checkbox>
            )}
          </div>
          {isOpenRouter ? (
            <Select
              showSearch
              style={{ width: '100%' }}
              size="large"
              placeholder="请选择模型 (Select a model)"
              value={model || undefined}
              onChange={setModel}
              loading={loadingModels}
              options={mainModelOptions}
              optionFilterProp="searchLabel"
            />
          ) : (
            <Input 
              value={model} 
              onChange={(e) => setModel(e.target.value)} 
              placeholder={t('llm.model.placeholder')} 
              size="large"
            />
          )}
        </div>

        {/* ── 视觉感知模型 ── */}
        <Divider style={{ margin: '20px 0 16px' }} />
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <Text strong style={{ fontSize: '14px' }}>视觉感知模型 (Vision)</Text>
            <Switch size="small" checked={midsenseEnabled} onChange={setMidsenseEnabled} />
          </div>
          <Paragraph type="secondary" style={{ fontSize: '13px', margin: '0 0 12px' }}>
            用于视觉恢复功能 (Cortex)，当主模型无法定位页面元素时自动触发，支持 UI-TARS、Qwen-VL 等视觉模型。
          </Paragraph>
          <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>
              {midsceneDocs.isChinese ? 'Midscene 官方配置说明' : 'Midscene official setup guide'}
              <span style={{ color: '#94a3b8', marginLeft: '6px' }}>({midsceneDocs.languageLabel})</span>
            </span>
            <span style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href={midsceneDocs.modelConfigUrl} target="_blank" rel="noreferrer">
                {midsceneDocs.isChinese ? '模型配置' : 'Model configuration'}
              </a>
              <a href={midsceneDocs.commonConfigUrl} target="_blank" rel="noreferrer">
                {midsceneDocs.isChinese ? '常用模型 / Family 对照' : 'Common models / family mapping'}
              </a>
            </span>
          </div>

          {midsenseEnabled && (
            <>
              {/* 复用默认模型 toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                <div>
                  <Text strong style={{ fontSize: '13px' }}>复用默认模型配置</Text>
                  <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>直接使用上方主模型，无需重复配置</Text>
                </div>
                <Switch size="small" checked={midsenseInherit} onChange={handleMidsenseInheritChange} />
              </div>

              {/* 继承模式：显示当前复用的配置摘要 + 视觉能力校验 */}
              {midsenseInherit ? (
                <>
                  <div style={{ padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '12px', fontSize: '13px', color: '#1e40af' }}>
                    当前复用：<strong>{providerLabel(provider)}</strong>
                    {model && <> &nbsp;/&nbsp; <strong>{model}</strong></>}
                    {model && <> &nbsp;/&nbsp; <strong>{inferMidsceneModelFamily(model)}</strong></>}
                    {!model && <span style={{ color: '#94a3b8' }}>&nbsp;（主模型尚未选择）</span>}
                  </div>
                  {!inheritedModelSupportsVision && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: '12px' }}
                      message="当前主模型不支持图像输入"
                      description={'视觉恢复功能 (Cortex) 需要能处理图片的视觉模型。请关闭「复用默认模型配置」，为视觉感知单独选择支持图像输入的模型（如 GPT-4o、Qwen-VL、UI-TARS 等）。'}
                    />
                  )}
                </>
              ) : (
                /* 独立配置模式 */
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>模型提供方 (Provider)</Text>
                    <Select
                      value={visionProvider}
                      onChange={handleVisionProviderChange}
                      style={{ width: '100%' }}
                      size="large"
                      options={PROVIDER_OPTIONS}
                    />
                  </div>

                  {isVisionOpenRouter && renderOpenRouterBanner(!!midsenseApiKey, () => handleOpenRouterLogin(true), isVisionLoggingIn)}

                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>Base URL</Text>
                    <Input
                      value={midsenseBaseUrl}
                      readOnly={visionProvider !== 'custom'}
                      onClick={() => { if (visionProvider !== 'custom') message.info('如需手动修改 Base URL，请先将"模型提供方"切换为"自定义 (Custom)"'); }}
                      onChange={(e) => { if (visionProvider === 'custom') setMidsenseBaseUrl(e.target.value); }}
                      placeholder="https://api.openai.com/v1"
                      size="large"
                      style={{ backgroundColor: visionProvider !== 'custom' ? '#f3f4f6' : '#fff' }}
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>API Key</Text>
                    <Input.Password 
                      value={midsenseApiKey} 
                      onChange={(e) => setMidsenseApiKey(e.target.value)} 
                      placeholder="视觉模型 API Key" 
                      size="large"
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>Model</Text>
                    {isVisionOpenRouter ? (
                      <Select
                        showSearch
                        style={{ width: '100%' }}
                        size="large"
                        placeholder="请选择视觉模型 (仅显示支持图像输入的模型)"
                        value={midsenseModel || undefined}
                        onChange={(value) => {
                          setMidsenseModel(value);
                          setMidsenseModelFamily(MIDSCENE_MODEL_FAMILY_AUTO);
                        }}
                        loading={visionLoadingModels}
                        options={visionModelOptions}
                        optionFilterProp="searchLabel"
                      />
                    ) : (
                      <Input
                        value={midsenseModel}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMidsenseModel(value);
                          setMidsenseModelFamily(MIDSCENE_MODEL_FAMILY_AUTO);
                        }}
                        placeholder="ui-tars-7b"
                        size="large"
                      />
                    )}
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>Midscene Model Family</Text>
                    <Select
                      showSearch
                      value={midsenseModelFamily}
                      onChange={setMidsenseModelFamily}
                      options={midsceneModelFamilyOptions}
                      style={{ width: '100%' }}
                      size="large"
                    />
                    {midsenseModelFamily === MIDSCENE_MODEL_FAMILY_AUTO && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                        保存时将使用：{inferMidsceneModelFamily(midsenseModel || 'ui-tars-7b')}
                      </div>
                    )}
                    {midsenseModelFamily === MIDSCENE_MODEL_FAMILY_EMPTY && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: '8px' }}
                        message="官方将 MIDSCENE_MODEL_FAMILY 标记为必填；不指定时，Midscene 的元素定位可能失败。"
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <Button
          type="primary"
          block
          size="large"
          onClick={handleSave}
          disabled={status === 'saving'}
          loading={status === 'saving'}
        >
          {status === 'saving' ? t('llm.saving') : t('llm.save')}
        </Button>

        {status === 'success' && <Text type="success" style={{ display: 'block', marginTop: '12px' }}>{t('llm.saveSuccess')}</Text>}
        {status === 'error' && <Alert type="error" message={errorMsg} style={{ marginTop: '12px' }} />}
      </Card>
    </Card>
  );
};

export default LlmTab;
