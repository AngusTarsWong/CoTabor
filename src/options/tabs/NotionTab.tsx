import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { initializeNotionBrainBase, extractNotionPageId, searchAccessibleNotionPages, type NotionPageOption } from '../../skills/bundled/notion-operator/init';
import { ENV } from '../../shared/constants/env';
import { NotionAuthManager, launchNotionOAuth, getNotionAccessTokenFromCode } from '../../shared/utils/notion-auth';

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
      setSearchError(e.message || t('notion.searchFailed'));
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
      setErrorMsg(e.message || t('notion.error.initFailed'));
    }
  };

  const selectedPage = pageOptions.find(page => page.url === pageUrl);
  const isUsingSavedParent = !!savedPageUrl && savedPageUrl.trim() === pageUrl.trim();
  const isInitializedAndActive = !!config && isActive && isUsingSavedParent;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>{t('notion.title')}</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
            {t('notion.desc')}
          </p>
        </div>
        {isActive && (
          <div style={{ padding: '4px 10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
            {t('notion.enabled')}
          </div>
        )}
      </div>

      {/* Step 1: Auth */}
      <div style={{ ...sectionBox, backgroundColor: isLoggedIn ? '#f8fafc' : 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{t('notion.step1.title')}</h3>
          {isLoggedIn && <span style={{ color: '#10b981', fontSize: '13px' }}>{t('notion.step1.connected')}</span>}
        </div>

        {/* Primary: OAuth button — always shown */}
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>👤</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{userName}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{t('notion.step1.authorized')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleOAuthLogin} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#374151' }}>{t('notion.step1.switchAccount')}</button>
              <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#dc2626' }}>{t('notion.step1.disconnect')}</button>
            </div>
          </div>
        ) : (
          <button
            onClick={hasOAuthCreds ? handleOAuthLogin : undefined}
            disabled={authLoading || !hasOAuthCreds}
            title={!hasOAuthCreds ? t('notion.step1.noOAuthTitle') : ''}
            style={{
              ...btn('#6366f1', authLoading || !hasOAuthCreds),
              width: '100%',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              letterSpacing: '0.3px',
            }}
          >
            {authLoading ? t('notion.step1.authorizing') : t('notion.step1.authBtn')}
          </button>
        )}

        {/* Secondary: manual token — collapsed by default */}
        {!isLoggedIn && (
          <details style={{ marginTop: '12px' }}>
            <summary style={{ fontSize: '12px', color: '#9ca3af', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>▶</span> {t('notion.step1.advancedToken')}
            </summary>
            <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Notion OAuth Client ID（本地保存）"
                style={{ ...inputStyle, fontSize: '13px' }}
              />
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="Notion OAuth Client Secret（本地保存）"
                style={{ ...inputStyle, fontSize: '13px' }}
              />
            </div>
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="secret_xxxxxxxx..."
                style={{ ...inputStyle, flex: 1, fontSize: '13px' }}
              />
              <button onClick={handleSaveKey} style={{ ...btn('#6b7280'), padding: '8px 12px', fontSize: '13px' }}>{t('notion.step1.tokenSave')}</button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#9ca3af', lineHeight: '1.5' }}>
              {t('notion.step1.tokenNote')}
            </p>
          </details>
        )}
      </div>

      {/* Step 2: Parent Page & Init */}
      <div style={{ ...sectionBox, opacity: isLoggedIn ? 1 : 0.5 }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>{t('notion.step2.title')}</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
          {t('notion.step2.desc')}
        </p>

        <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>{t('notion.step2.tipTitle')}</div>
          <div style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.7' }}>
            1. {t('notion.step2.tip1')}
            <br />
            2. {t('notion.step2.tip2')}
            <br />
            3. {t('notion.step2.tip3')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => loadAccessiblePages(apiKey)}
            disabled={!isLoggedIn || searchLoading}
            style={{ ...btn('#374151', !isLoggedIn || searchLoading), padding: '8px 12px', fontSize: '13px' }}
          >
            {searchLoading ? t('notion.step2.refreshing') : t('notion.step2.refreshBtn')}
          </button>
          <button
            onClick={() => loadAccessiblePages(apiKey, searchQuery)}
            disabled={!isLoggedIn || searchLoading}
            style={{ ...btn('#6366f1', !isLoggedIn || searchLoading), padding: '8px 12px', fontSize: '13px' }}
          >
            {t('notion.step2.searchBtn')}
          </button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px', color: '#374151' }}>{t('notion.step2.searchLabel')}</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={!isLoggedIn}
            style={inputStyle}
            placeholder={t('notion.step2.searchPlaceholder')}
          />
        </div>

        {searchError && (
          <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '13px', border: '1px solid #fee2e2' }}>
            ❌ {searchError}
          </div>
        )}

        {!!pageUrl && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 600, marginBottom: '4px' }}>{t('notion.step2.selectedPage')}</div>
            <div style={{ fontSize: '13px', color: '#111827', fontWeight: 600, marginBottom: '2px' }}>
              {selectedPage?.title || t('notion.step2.manualInput')}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>{pageUrl}</div>
          </div>
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
              pageOptions.map(page => {
                const isSelected = pageUrl === page.url;
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      setPageUrl(page.url);
                      setErrorMsg('');
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: isSelected ? '#eff6ff' : 'white',
                      border: 'none',
                      borderTop: '1px solid #e5e7eb',
                      padding: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                        {page.title}
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: '11px', color: '#1d4ed8', backgroundColor: '#dbeafe', borderRadius: '999px', padding: '2px 8px', fontWeight: 600 }}>
                          {t('notion.step2.selected')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>{page.url}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px', color: '#374151' }}>{t('notion.step2.parentUrlLabel')}</label>
          <input
            type="text"
            value={pageUrl}
            onChange={e => setPageUrl(e.target.value)}
            disabled={!isLoggedIn}
            style={inputStyle}
            placeholder="https://www.notion.so/My-Page-..."
          />
        </div>

        <button
          onClick={handleInitAndActivate}
          disabled={initStatus === 'loading' || !isLoggedIn}
          style={{
            ...btn('#2563eb', initStatus === 'loading' || !isLoggedIn),
            width: '100%',
            padding: '12px',
            fontSize: '15px',
            fontWeight: 600,
            borderRadius: '8px',
            backgroundColor: (initStatus === 'success' || isInitializedAndActive) ? '#10b981' : '#2563eb'
          }}
        >
          {initStatus === 'loading' ? t('notion.step2.loading') :
           (initStatus === 'success' || isInitializedAndActive) ? t('notion.step2.success') :
           t('notion.step2.initBtn')}
        </button>

        {errorMsg && (
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '13px', border: '1px solid #fee2e2' }}>
            ❌ {errorMsg}
          </div>
        )}
      </div>

      {/* Backend switch link */}
      {config && !isActive && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>{t('notion.existingConfig')}</p>
            <button onClick={handleInitAndActivate} style={btn('#059669')}>{t('notion.activateBtn')}</button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #e5e7eb' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color: '#374151' }}>{t('notion.tipsTitle')}</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
          <li>{t('notion.tip1')}</li>
          <li>{t('notion.tip2')}</li>
          <li>{t('notion.tip3')}</li>
        </ul>
      </div>
    </div>
  );
};

export default NotionTab;
