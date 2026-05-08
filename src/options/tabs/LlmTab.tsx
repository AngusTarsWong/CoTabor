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

const PROVIDER_VALUES = ['openrouter', 'deepseek', 'openai', 'custom'];

function inferProvider(baseUrl: string): string {
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('deepseek.com')) return 'deepseek';
  if (baseUrl.includes('api.openai.com')) return 'openai';
  return 'custom';
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
  const providerOptions = useMemo(
    () => PROVIDER_VALUES.map((value) => ({
      value,
      label: t(`llm.provider.options.${value}`),
    })),
    [t],
  );
  const providerLabel = (val: string): string =>
    providerOptions.find(o => o.value === val)?.label ?? val;

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
      message.success(t('llm.openRouter.authSuccess'));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || t('llm.openRouter.authFailed'));
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
              {isVision && <Tag color="blue">{t('llm.model.tag.vision')}</Tag>}
              {isFree && <Tag color="success">{t('llm.model.tag.free')}</Tag>}
            </div>
          </div>
        ),
        searchLabel: m.name,
      };
    });
  }, [openRouterModels, mainOnlyVision, t]);

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
              <Tag color="blue">{t('llm.model.tag.vision')}</Tag>
              {isFree && <Tag color="success">{t('llm.model.tag.free')}</Tag>}
            </div>
          </div>
        ),
        searchLabel: m.name,
      };
    }), [openRouterModels, t]);

  const midsceneModelFamilyOptions = useMemo(
    () => [
      {
        value: MIDSCENE_MODEL_FAMILY_AUTO,
        label: t('llm.vision.family.auto'),
      },
      {
        value: MIDSCENE_MODEL_FAMILY_EMPTY,
        label: t('llm.vision.family.empty'),
      },
      ...MIDSCENE_MODEL_FAMILY_OPTIONS.map((value) => ({
        value,
        label: `${value} - ${MIDSCENE_MODEL_FAMILY_DESCRIPTIONS[value] ?? t('llm.vision.family.official')}`,
      })),
    ],
    [t],
  );

  const renderOpenRouterBanner = (hasKey: boolean, onLogin: () => void, isLoading: boolean) => {
    if (!hasKey) {
      return (
        <Card type="inner" style={{ marginBottom: '16px', backgroundColor: '#f8fafc', borderStyle: 'dashed' }}>
          <Space align="center" style={{ marginBottom: '8px' }}>
            <RocketOutlined style={{ fontSize: '18px', color: '#18181b' }} />
            <Text strong style={{ fontSize: '14px', margin: 0 }}>{t('llm.openRouter.bannerTitle')}</Text>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: '13px', marginBottom: '12px' }}>
            {t('llm.openRouter.bannerDesc')}
          </Paragraph>
          <Button type="primary" onClick={onLogin} loading={isLoading} style={{ backgroundColor: '#18181b' }}>
            {t('llm.openRouter.login')}
          </Button>
        </Card>
      );
    }
    return (
      <Alert
        message={<Space><CheckCircleOutlined /> {t('llm.openRouter.authorized')}</Space>}
        type="success"
        style={{ marginBottom: '16px' }}
        action={<Button size="small" onClick={onLogin} loading={isLoading}>{t('llm.openRouter.reauthorize')}</Button>}
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
        {/* Main model config */}
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>{t('llm.provider.label')}</Text>
          <Select
            value={provider}
            onChange={handleProviderChange}
            style={{ width: '100%' }}
            size="large"
            options={providerOptions}
          />
        </div>

        {isOpenRouter && renderOpenRouterBanner(!!apiKey, () => handleOpenRouterLogin(false), isLoggingIn)}

        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>{t('llm.baseUrl.label')}</Text>
          <Input
            value={baseUrl}
            readOnly={provider !== 'custom'}
            onClick={() => { if (provider !== 'custom') message.info(t('llm.provider.customOnlyBaseUrl')); }}
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
              placeholder={t('llm.model.selectPlaceholder')}
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

        {/* Vision model config */}
        <Divider style={{ margin: '20px 0 16px' }} />
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <Text strong style={{ fontSize: '14px' }}>{t('llm.vision.title')}</Text>
            <Switch size="small" checked={midsenseEnabled} onChange={setMidsenseEnabled} />
          </div>
          <Paragraph type="secondary" style={{ fontSize: '13px', margin: '0 0 12px' }}>
            {t('llm.vision.description')}
          </Paragraph>
          <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>
              {t('llm.vision.docs.title')}
              <span style={{ color: '#94a3b8', marginLeft: '6px' }}>({t(midsceneDocs.isChinese ? 'llm.vision.docs.languageChinese' : 'llm.vision.docs.languageEnglish')})</span>
            </span>
            <span style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href={midsceneDocs.modelConfigUrl} target="_blank" rel="noreferrer">
                {t('llm.vision.docs.modelConfig')}
              </a>
              <a href={midsceneDocs.commonConfigUrl} target="_blank" rel="noreferrer">
                {t('llm.vision.docs.familyMapping')}
              </a>
            </span>
          </div>

          {midsenseEnabled && (
            <>
              {/* Reuse default model toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                <div>
                  <Text strong style={{ fontSize: '13px' }}>{t('llm.vision.inherit.title')}</Text>
                  <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>{t('llm.vision.inherit.desc')}</Text>
                </div>
                <Switch size="small" checked={midsenseInherit} onChange={handleMidsenseInheritChange} />
              </div>

              {/* Inherit mode: reused config summary and vision capability check */}
              {midsenseInherit ? (
                <>
                  <div style={{ padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '12px', fontSize: '13px', color: '#1e40af' }}>
                    {t('llm.vision.inherit.current')}<strong>{providerLabel(provider)}</strong>
                    {model && <> &nbsp;/&nbsp; <strong>{model}</strong></>}
                    {model && <> &nbsp;/&nbsp; <strong>{inferMidsceneModelFamily(model)}</strong></>}
                    {!model && <span style={{ color: '#94a3b8' }}>&nbsp;{t('llm.vision.inherit.noModel')}</span>}
                  </div>
                  {!inheritedModelSupportsVision && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: '12px' }}
                      message={t('llm.vision.inherit.noVisionTitle')}
                      description={t('llm.vision.inherit.noVisionDesc')}
                    />
                  )}
                </>
              ) : (
                /* Independent config mode */
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>{t('llm.provider.label')}</Text>
                    <Select
                      value={visionProvider}
                      onChange={handleVisionProviderChange}
                      style={{ width: '100%' }}
                      size="large"
                      options={providerOptions}
                    />
                  </div>

                  {isVisionOpenRouter && renderOpenRouterBanner(!!midsenseApiKey, () => handleOpenRouterLogin(true), isVisionLoggingIn)}

                  <div style={{ marginBottom: '12px' }}>
                    <Text strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px' }}>Base URL</Text>
                    <Input
                      value={midsenseBaseUrl}
                      readOnly={visionProvider !== 'custom'}
                      onClick={() => { if (visionProvider !== 'custom') message.info(t('llm.provider.customOnlyBaseUrl')); }}
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
                      placeholder={t('llm.vision.apiKeyPlaceholder')}
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
                        placeholder={t('llm.vision.modelSelectPlaceholder')}
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
                        {t('llm.vision.family.saveWith', { family: inferMidsceneModelFamily(midsenseModel || 'ui-tars-7b') })}
                      </div>
                    )}
                    {midsenseModelFamily === MIDSCENE_MODEL_FAMILY_EMPTY && (
                      <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: '8px' }}
                        message={t('llm.vision.family.emptyWarning')}
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
