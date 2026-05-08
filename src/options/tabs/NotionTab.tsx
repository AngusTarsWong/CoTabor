import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button, Input, Typography, Alert, Space, Collapse, Tag, List, Badge, Tooltip } from 'antd';
import { UserOutlined, SwapOutlined, DisconnectOutlined, ReloadOutlined, SearchOutlined, CheckCircleOutlined, ExclamationCircleOutlined, LinkOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import {
  initializeNotionBrainBase,
  extractNotionPageId,
  searchAccessibleNotionPages,
  NotionNetworkError,
  type NotionPageOption,
} from '../../skills/bundled/notion-operator/init';
import { ENV } from '../../shared/constants/env';
import { NotionAuthManager, launchNotionOAuth, getNotionAccessTokenFromCode } from '../../shared/utils/notion-auth';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

function isNotionNetworkFailure(error: unknown): boolean {
  if (error instanceof NotionNetworkError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const maybeError = error as { code?: unknown; message?: unknown };
  return (
    maybeError.code === 'NOTION_NETWORK_ERROR'
    || (typeof maybeError.message === 'string'
      && /notion api request failed|failed to fetch|networkerror|err_connection/i.test(maybeError.message))
  );
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

const NotionTab: React.FC = () => {
  const { t } = useTranslation('options');
  const [apiKey, setApiKey]           = useState('');
  const [clientId, setClientId]       = useState(ENV.NOTION_CLIENT_ID || '');
  const [clientSecret, setClientSecret] = useState('');
  const [pageUrl, setPageUrl]         = useState('');
  const [initStatus, setInitStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [config, setConfig]           = useState<any>(null);
  const [isActive, setIsActive]       = useState(false);
  const [userName, setUserName]       = useState('');
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [savedPageUrl, setSavedPageUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageOptions, setPageOptions] = useState<NotionPageOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const hasOAuthCreds = !!(clientId.trim() && clientSecret.trim());

  const loadAccessiblePages = async (token: string, query = '') => {
    if (!token.trim()) {
      setSearchError(t('notion.noAuth'));
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    try {
      const pages = await searchAccessibleNotionPages(token.trim(), query.trim());
      setPageOptions(pages);
    } catch (e: any) {
      setSearchError(isNotionNetworkFailure(e) ? t('notion.error.searchNetwork') : (getErrorText(e) || t('notion.searchFailed')));
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    chrome.storage.local.get(['notionApiKey', 'notionBackendConfig', 'storageBackend', 'notionParentPageUrl', 'notionClientId', 'notionClientSecret'], async (r) => {
      if (r.notionApiKey)        setApiKey(r.notionApiKey);
      if (r.notionBackendConfig) setConfig(r.notionBackendConfig);
      if (r.notionClientId) setClientId(r.notionClientId);
      if (r.notionClientSecret) setClientSecret(r.notionClientSecret);
      if (r.notionParentPageUrl) {
        setPageUrl(r.notionParentPageUrl);
        setSavedPageUrl(r.notionParentPageUrl);
      }
      setIsActive(r.storageBackend === 'notion');

      const session = await NotionAuthManager.getInstance().loadSession();
      if (session?.access_token) {
        setIsLoggedIn(true);
        setUserName(session.user_name ?? session.workspace_name ?? t('notion.defaultUser'));
        await loadAccessiblePages(session.access_token);
      }
    });
  }, []);

  const handleOAuthLogin = async () => {
    setAuthLoading(true);
    setErrorMsg('');
    try {
      const localClientId = clientId.trim();
      const localClientSecret = clientSecret.trim();
      if (!localClientId || !localClientSecret) throw new Error(t('notion.error.noClientId'));
      await chrome.storage.local.set({ notionClientId: localClientId, notionClientSecret: localClientSecret });

      const redirectUri = chrome.identity.getRedirectURL();
      const code        = await launchNotionOAuth(localClientId);
      const session     = await getNotionAccessTokenFromCode(code, localClientId, localClientSecret, redirectUri);

      await NotionAuthManager.getInstance().saveSession(session);
      setApiKey(session.access_token);
      setIsLoggedIn(true);
      setUserName(session.user_name ?? session.workspace_name ?? t('notion.defaultUser'));
      await loadAccessiblePages(session.access_token);
    } catch (e: any) {
      setErrorMsg(e.message || t('notion.error.authFailed'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await NotionAuthManager.getInstance().clearSession();
    setIsLoggedIn(false);
    setUserName('');
    setApiKey('');
    setIsActive(false);
    setSavedPageUrl('');
    setSearchQuery('');
    setPageOptions([]);
    setSearchError('');
    chrome.storage.local.remove(['storageBackend', 'notionBackendConfig', 'notionApiKey', 'notionParentPageUrl']);
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await chrome.storage.local.set({ notionApiKey: apiKey.trim() });
    setIsLoggedIn(true);
    setUserName(t('notion.tokenSaved'));
    await loadAccessiblePages(apiKey);
  };

  const handleInitAndActivate = async () => {
    const key = apiKey.trim();
    if (!key)            { setErrorMsg(t('notion.error.noAuth')); return; }
    if (!pageUrl.trim()) { setErrorMsg(t('notion.error.noPage')); return; }

    setInitStatus('loading');
    setErrorMsg('');

    try {
      const parentPageId = extractNotionPageId(pageUrl.trim());
      await chrome.storage.local.set({
        notionApiKey: key,
        notionParentPageUrl: pageUrl.trim()
      });

      const cfg = await initializeNotionBrainBase({ apiKey: key, parentPageId });

      await chrome.storage.local.set({
        notionBackendConfig: cfg,
        storageBackend: 'notion'
      });

      setConfig(cfg);
      setIsActive(true);
      setSavedPageUrl(pageUrl.trim());
      setInitStatus('success');
    } catch (e: any) {
      setInitStatus('error');
      setErrorMsg(isNotionNetworkFailure(e) ? t('notion.error.network') : (getErrorText(e) || t('notion.error.initFailed')));
    }
  };

  const selectedPage = pageOptions.find(page => page.url === pageUrl);
  const isUsingSavedParent = !!savedPageUrl && savedPageUrl.trim() === pageUrl.trim();
  const isInitializedAndActive = !!config && isActive && isUsingSavedParent;

  return (
    <Card bordered={false} style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <Title level={4} style={{ margin: '0 0 4px' }}>{t('notion.title')}</Title>
          <Text type="secondary">{t('notion.desc')}</Text>
        </div>
        {isActive && (
          <Tag color="success" style={{ borderRadius: '12px', padding: '4px 10px', fontWeight: 600 }}>
            {t('notion.enabled')}
          </Tag>
        )}
      </div>

      {/* Step 1: Auth */}
      <Card type="inner" style={{ marginBottom: '24px', backgroundColor: isLoggedIn ? '#f8fafc' : 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <Text strong style={{ fontSize: '15px' }}>{t('notion.step1.title')}</Text>
          {isLoggedIn && <Text type="success"><CheckCircleOutlined /> {t('notion.step1.connected')}</Text>}
        </div>

        {/* Primary: OAuth button — always shown */}
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space align="center" size="middle">
              <div style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                <UserOutlined />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{userName}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{t('notion.step1.authorized')}</div>
              </div>
            </Space>
            <Space>
              <Button size="small" icon={<SwapOutlined />} onClick={handleOAuthLogin}>{t('notion.step1.switchAccount')}</Button>
              <Button size="small" danger icon={<DisconnectOutlined />} onClick={handleLogout}>{t('notion.step1.disconnect')}</Button>
            </Space>
          </div>
        ) : (
          <Button
            type="primary"
            block
            size="large"
            onClick={hasOAuthCreds ? handleOAuthLogin : undefined}
            disabled={authLoading || !hasOAuthCreds}
            title={!hasOAuthCreds ? t('notion.step1.noOAuthTitle') : ''}
            loading={authLoading}
          >
            {authLoading ? t('notion.step1.authorizing') : t('notion.step1.authBtn')}
          </Button>
        )}

        {/* Secondary: manual token — collapsed by default */}
        {!isLoggedIn && (
          <Collapse ghost style={{ marginTop: '16px', backgroundColor: 'transparent' }}>
            <Panel header={<Text type="secondary" style={{ fontSize: '12px' }}>{t('notion.step1.advancedToken')}</Text>} key="1">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="Notion OAuth Client ID（本地保存）"
                />
                <Input.Password
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  placeholder="Notion OAuth Client Secret（本地保存）"
                />
                <Space.Compact style={{ width: '100%' }}>
                  <Input.Password
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="secret_xxxxxxxx..."
                    style={{ width: 'calc(100% - 100px)' }}
                  />
                  <Button onClick={handleSaveKey} style={{ width: '100px' }}>{t('notion.step1.tokenSave')}</Button>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {t('notion.step1.tokenNote')}
                </Text>
              </Space>
            </Panel>
          </Collapse>
        )}
      </Card>

      {/* Step 2: Parent Page & Init */}
      <Card type="inner" style={{ opacity: isLoggedIn ? 1 : 0.5, marginBottom: '24px' }}>
        <Text strong style={{ fontSize: '15px', display: 'block', marginBottom: '12px' }}>{t('notion.step2.title')}</Text>
        <Paragraph type="secondary" style={{ fontSize: '13px' }}>
          {t('notion.step2.desc')}
        </Paragraph>

        <Alert
          message={t('notion.step2.tipTitle')}
          description={
            <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '12px' }}>
              <li>{t('notion.step2.tip1')}</li>
              <li>{t('notion.step2.tip2')}</li>
              <li>{t('notion.step2.tip3')}</li>
            </ul>
          }
          type="warning"
          showIcon
          style={{ marginBottom: '16px', backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
        />

        <Space style={{ marginBottom: '12px' }} wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadAccessiblePages(apiKey)}
            disabled={!isLoggedIn || searchLoading}
            loading={searchLoading}
          >
            {t('notion.step2.refreshBtn')}
          </Button>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => loadAccessiblePages(apiKey, searchQuery)}
            disabled={!isLoggedIn || searchLoading}
            loading={searchLoading}
          >
            {t('notion.step2.searchBtn')}
          </Button>
        </Space>

        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>{t('notion.step2.searchLabel')}</Text>
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={!isLoggedIn}
            placeholder={t('notion.step2.searchPlaceholder')}
            onPressEnter={() => loadAccessiblePages(apiKey, searchQuery)}
          />
        </div>

        {searchError && (
          <Alert message={searchError} type="error" showIcon style={{ marginBottom: '16px' }} />
        )}

        {!!pageUrl && (
          <Alert
            message={<Text strong style={{ color: '#1d4ed8' }}>{t('notion.step2.selectedPage')}</Text>}
            description={
              <div>
                <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                  {selectedPage?.title || t('notion.step2.manualInput')}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>{pageUrl}</div>
              </div>
            }
            type="info"
            style={{ marginBottom: '16px', backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}
          />
        )}

        <div style={{ marginBottom: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f9fafb' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            {t('notion.step2.pageListTitle')}
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {!isLoggedIn ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af' }}>{t('notion.step2.listNotLoggedIn')}</div>
            ) : searchLoading ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>{t('notion.step2.listLoading')}</div>
            ) : pageOptions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#6b7280', lineHeight: '1.7' }}>
                {t('notion.step2.listEmpty')}
              </div>
            ) : (
              <List
                size="small"
                dataSource={pageOptions}
                renderItem={page => {
                  const isSelected = pageUrl === page.url;
                  return (
                    <List.Item
                      onClick={() => {
                        setPageUrl(page.url);
                        setErrorMsg('');
                      }}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#eff6ff' : 'white',
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <Text strong>{page.title}</Text>
                          {isSelected && <Tag color="blue" style={{ margin: 0 }}>{t('notion.step2.selected')}</Tag>}
                        </div>
                        <Text type="secondary" style={{ fontSize: '12px', wordBreak: 'break-all' }}>{page.url}</Text>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>{t('notion.step2.parentUrlLabel')}</Text>
          <Input
            value={pageUrl}
            onChange={e => setPageUrl(e.target.value)}
            disabled={!isLoggedIn}
            placeholder="https://www.notion.so/My-Page-..."
          />
        </div>

        <Button
          type="primary"
          block
          size="large"
          onClick={handleInitAndActivate}
          disabled={initStatus === 'loading' || !isLoggedIn}
          loading={initStatus === 'loading'}
          style={
            (initStatus === 'success' || isInitializedAndActive)
              ? { backgroundColor: '#10b981', borderColor: '#10b981' }
              : undefined
          }
        >
          {initStatus === 'loading' ? t('notion.step2.loading') :
           (initStatus === 'success' || isInitializedAndActive) ? t('notion.step2.success') :
           t('notion.step2.initBtn')}
        </Button>

        {errorMsg && (
          <Alert message={errorMsg} type="error" showIcon style={{ marginTop: '16px' }} />
        )}
      </Card>

      {/* Backend switch link */}
      {config && !isActive && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: '8px' }}>{t('notion.existingConfig')}</Text>
          <Button onClick={handleInitAndActivate} type="default" style={{ borderColor: '#059669', color: '#059669' }}>
            {t('notion.activateBtn')}
          </Button>
        </div>
      )}

      {/* Tips */}
      <Card type="inner" style={{ marginTop: '24px', backgroundColor: '#f9fafb', borderStyle: 'dashed' }}>
        <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>{t('notion.tipsTitle')}</Text>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
          <li>{t('notion.tip1')}</li>
          <li>{t('notion.tip2')}</li>
          <li>{t('notion.tip3')}</li>
        </ul>
      </Card>
    </Card>
  );
};

export default NotionTab;
