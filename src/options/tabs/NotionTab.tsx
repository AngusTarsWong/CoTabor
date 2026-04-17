import React, { useState, useEffect } from 'react';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { initializeNotionBrainBase, extractNotionPageId } from '../../skills/bundled/notion-operator/init';
import { ENV } from '../../shared/constants/env';
import { NotionAuthManager, launchNotionOAuth, getNotionAccessTokenFromCode } from '../../shared/utils/notion-auth';

const NotionTab: React.FC = () => {
  const [apiKey, setApiKey]           = useState('');
  const [pageUrl, setPageUrl]         = useState('');
  const [initStatus, setInitStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [config, setConfig]           = useState<any>(null);
  const [isActive, setIsActive]       = useState(false);
  const [userName, setUserName]       = useState('');
  const [isLoggedIn, setIsLoggedIn]   = useState(false);

  const hasOAuthCreds = !!(ENV.NOTION_CLIENT_ID);

  useEffect(() => {
    chrome.storage.local.get(['notionApiKey', 'notionBackendConfig', 'storageBackend', 'notionParentPageUrl'], async (r) => {
      if (r.notionApiKey)        setApiKey(r.notionApiKey);
      if (r.notionBackendConfig) setConfig(r.notionBackendConfig);
      if (r.notionParentPageUrl) setPageUrl(r.notionParentPageUrl);
      setIsActive(r.storageBackend === 'notion');

      const session = await NotionAuthManager.getInstance().loadSession();
      if (session?.access_token) {
        setIsLoggedIn(true);
        setUserName(session.user_name ?? session.workspace_name ?? 'Notion 用户');
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
    chrome.storage.local.set({ storageBackend: 'feishu' });
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await chrome.storage.local.set({ notionApiKey: apiKey.trim() });
    setIsLoggedIn(true);
    setUserName('已配置 Token');
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
      setInitStatus('success');
      setTimeout(() => setInitStatus('idle'), 3000);
    } catch (e: any) {
      setInitStatus('error');
      setErrorMsg(e.message || '初始化失败');
    }
  };

  const handleDeactivate = async () => {
    await chrome.storage.local.set({ storageBackend: 'feishu' });
    setIsActive(false);
  };

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

        {hasOAuthCreds ? (
          <div>
            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '16px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>👤</div>
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>{userName}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleOAuthLogin} style={{ ...btn('#f3f4f6'), color: '#374151', fontSize: '12px', padding: '4px 8px' }}>切换账号</button>
                  <button onClick={handleLogout} style={{ ...btn('#fef2f2'), color: '#dc2626', fontSize: '12px', padding: '4px 8px' }}>断开</button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleOAuthLogin}
                disabled={authLoading}
                style={{ ...btn('#6366f1', authLoading), width: '100%', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600 }}
              >
                {authLoading ? '⏳ 正在拉起授权...' : '🔑 网页快速授权 Notion'}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="输入 Integration Token (secret_...)"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSaveKey} style={btn('#6b7280')}>保存</button>
          </div>
        )}
      </div>

      {/* Step 2: Parent Page & Init */}
      <div style={{ ...sectionBox, opacity: isLoggedIn ? 1 : 0.5 }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>步骤 2：设置母文档</h3>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
          只需提供一个空页面的 URL，CoTabor 将自动为您构建全套 AI 记忆系统（L1/L2/L3 数据库）。
        </p>

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
            backgroundColor: initStatus === 'success' ? '#10b981' : '#2563eb'
          }}
        >
          {initStatus === 'loading' ? '⏳ 正在魔改 Notion 中...' :
           initStatus === 'success' ? '✨ 初始化成功并已启用！' :
           '🚀 一键构建并启用 AI 记忆中心'}
        </button>

        {errorMsg && (
          <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '13px', border: '1px solid #fee2e2' }}>
            ❌ {errorMsg}
          </div>
        )}
      </div>

      {/* Backend switch link */}
      {config && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          {isActive ? (
            <button onClick={handleDeactivate} style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}>
              且慢，我想切回飞书后端
            </button>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>检测到已初始化的配置</p>
              <button onClick={handleInitAndActivate} style={btn('#059669')}>激活 Notion 后端</button>
            </div>
          )}
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
