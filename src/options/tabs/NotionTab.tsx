import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { initializeNotionBrainBase, extractNotionPageId, searchAccessibleNotionPages, type NotionPageOption } from '../../skills/bundled/notion-operator/init';
import { ENV } from '../../shared/constants/env';
import { NotionAuthManager, launchNotionOAuth, getNotionAccessTokenFromCode } from '../../shared/utils/notion-auth';

const NotionTab: React.FC = () => {
  const { t } = useTranslation('options');
  const [apiKey, setApiKey]           = useState('');
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

  const hasOAuthCreds = !!(ENV.NOTION_CLIENT_ID);

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
    chrome.storage.local.get(['notionApiKey', 'notionBackendConfig', 'storageBackend', 'notionParentPageUrl'], async (r) => {
      if (r.notionApiKey)        setApiKey(r.notionApiKey);
      if (r.notionBackendConfig) setConfig(r.notionBackendConfig);
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
      const clientId     = ENV.NOTION_CLIENT_ID;
      const clientSecret = ENV.NOTION_CLIENT_SECRET;
      if (!clientId) throw new Error('插件未配置 VITE_NOTION_CLIENT_ID，无法使用 OAuth 授权。');

      const redirectUri = chrome.identity.getRedirectURL();
      const code        = await launchNotionOAuth(clientId);
      const session     = await getNotionAccessTokenFromCode(code, clientId, clientSecret, redirectUri);

      await NotionAuthManager.getInstance().saveSession(session);
      setApiKey(session.access_token);
      setIsLoggedIn(true);
      setUserName(session.user_name ?? session.workspace_name ?? 'Notion 用户');
      await loadAccessiblePages(session.access_token);
    } catch (e: any) {
      setErrorMsg(e.message || 'OAuth 授权失败');
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
    chrome.storage.local.set({ storageBackend: 'feishu' });
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await chrome.storage.local.set({ notionApiKey: apiKey.trim() });
    setIsLoggedIn(true);
    setUserName('已配置 Token');
    await loadAccessiblePages(apiKey);
  };

  const handleInitAndActivate = async () => {
    const key = apiKey.trim();
    if (!key)            { setErrorMsg('请先完成授权或填写 Integration Token'); return; }
    if (!pageUrl.trim()) { setErrorMsg('请填写母文档 (Parent Page) URL'); return; }

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
      setErrorMsg(e.message || '初始化失败');
    }
  };

  const selectedPage = pageOptions.find(page => page.url === pageUrl);
  const isUsingSavedParent = !!savedPageUrl && savedPageUrl.trim() === pageUrl.trim();
  const isInitializedAndActive = !!config && isActive && isUsingSavedParent;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>📝 Notion 记忆后端</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
            利用 Notion Database 存储 AI 记忆，体验极致丝滑。
          </p>
        </div>
        {isActive && (
          <div style={{ padding: '4px 10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
            已启用
          </div>
        )}
      </div>

      {/* Step 1: Auth */}
      <div style={{ ...sectionBox, backgroundColor: isLoggedIn ? '#f8fafc' : 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>步骤 1：连接 Notion</h3>
          {isLoggedIn && <span style={{ color: '#10b981', fontSize: '13px' }}>✅ 已连接</span>}
        </div>

        {/* Primary: OAuth button — always shown */}
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '18px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>👤</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{userName}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Notion 已授权</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleOAuthLogin} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#374151' }}>切换账号</button>
              <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#dc2626' }}>断开</button>
            </div>
          </div>
        ) : (
          <button
            onClick={hasOAuthCreds ? handleOAuthLogin : undefined}
            disabled={authLoading || !hasOAuthCreds}
            title={!hasOAuthCreds ? '当前构建未配置 OAuth，请使用下方手动 Token' : ''}
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
            {authLoading ? '⏳ 正在拉起授权...' : '🔑 一键授权 Notion'}
          </button>
        )}

        {/* Secondary: manual token — collapsed by default */}
        {!isLoggedIn && (
          <details style={{ marginTop: '12px' }}>
            <summary style={{ fontSize: '12px', color: '#9ca3af', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>▶</span> 高级：手动填写 Integration Token
            </summary>
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="secret_xxxxxxxx..."
                style={{ ...inputStyle, flex: 1, fontSize: '13px' }}
              />
              <button onClick={handleSaveKey} style={{ ...btn('#6b7280'), padding: '8px 12px', fontSize: '13px' }}>保存</button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#9ca3af', lineHeight: '1.5' }}>
              前往 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>notion.so/my-integrations</a> 创建 Integration 并复制 Token。
            </p>
          </details>
        )}
      </div>

      {/* Step 2: Parent Page & Init */}
      <div style={{ ...sectionBox, opacity: isLoggedIn ? 1 : 0.5 }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>步骤 2：设置母文档</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
          先刷新已授权页面并直接选择母文档；如果没找到，再用搜索功能精准定位，最后仍可手动粘贴 URL 兜底。
        </p>

        <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>推荐操作顺序</div>
          <div style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.7' }}>
            1. 先点“刷新已授权页面”拉取你当前能访问的页面。
            <br />
            2. 如果列表太多，用关键词搜索页面标题。
            <br />
            3. 如果仍然没找到，回到 Notion 页面右上角“…” → “连接”，把当前页面授权给这个 Integration 后再回来刷新。
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => loadAccessiblePages(apiKey)}
            disabled={!isLoggedIn || searchLoading}
            style={{ ...btn('#374151', !isLoggedIn || searchLoading), padding: '8px 12px', fontSize: '13px' }}
          >
            {searchLoading ? '⏳ 刷新中...' : '↻ 刷新已授权页面'}
          </button>
          <button
            onClick={() => loadAccessiblePages(apiKey, searchQuery)}
            disabled={!isLoggedIn || searchLoading}
            style={{ ...btn('#6366f1', !isLoggedIn || searchLoading), padding: '8px 12px', fontSize: '13px' }}
          >
            🔎 搜索页面
          </button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px', color: '#374151' }}>搜索关键词</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={!isLoggedIn}
            style={inputStyle}
            placeholder="输入页面标题关键词，用于精准检索"
          />
        </div>

        {searchError && (
          <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '13px', border: '1px solid #fee2e2' }}>
            ❌ {searchError}
          </div>
        )}

        {!!pageUrl && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 600, marginBottom: '4px' }}>当前已选母文档</div>
            <div style={{ fontSize: '13px', color: '#111827', fontWeight: 600, marginBottom: '2px' }}>
              {selectedPage?.title || '手动输入的页面'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>{pageUrl}</div>
          </div>
        )}

        <div style={{ marginBottom: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f9fafb' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            已授权页面列表
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {!isLoggedIn ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af' }}>完成授权后即可列出当前可访问的 Notion 页面。</div>
            ) : searchLoading ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>正在检索 Notion 页面...</div>
            ) : pageOptions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '13px', color: '#6b7280', lineHeight: '1.7' }}>
                没有找到页面。可以先点“刷新已授权页面”，或者输入关键词后点“搜索页面”。
                <br />
                如果目标页不在列表里，通常是这个页面还没授权给当前 Integration。
                <br />
                请前往 <a href="https://www.notion.so/" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Notion</a> 打开目标页面，在右上角“…” → “连接”中添加当前 Integration，然后回来重新刷新。
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
                          已选中
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
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px', color: '#374151' }}>母文档 URL</label>
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
          {initStatus === 'loading' ? '⏳ 正在魔改 Notion 中...' :
           (initStatus === 'success' || isInitializedAndActive) ? '✨ 初始化成功并已启用！' :
           '🚀 一键构建并启用 AI 记忆中心'}
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
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>检测到已初始化的配置</p>
            <button onClick={handleInitAndActivate} style={btn('#059669')}>激活 Notion 后端</button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #e5e7eb' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color: '#374151' }}>💡 提示</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
          <li>如果您已经手动在 Notion 页面添加了"连接"，初始化速度会更快。</li>
          <li>多次点击"一键构建"是安全的，系统会自动识别并复用已有的数据库。</li>
          <li>OAuth 授权是最快捷的方式，无需手动生成 Token。</li>
        </ul>
      </div>
    </div>
  );
};

export default NotionTab;
