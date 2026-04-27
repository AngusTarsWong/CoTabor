import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { initializeBrainBase } from '../../skills/bundled/feishu-operator/init';
import { ENV } from '../../shared/constants/env';
import { LarkAuthManager, getAccessTokenFromCode } from '../../shared/utils/lark-auth';

const FeishuTab: React.FC = () => {
  const { t } = useTranslation('options');
  const [folderToken, setFolderToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['larkFolderToken', 'brainBaseConfig'], (result) => {
      if (result.larkFolderToken) setFolderToken(result.larkFolderToken);
      if (result.brainBaseConfig) setConfig(result.brainBaseConfig);
    });
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    const session = await LarkAuthManager.getInstance().loadSessionAsync();
    if (session?.access_token) {
      setIsLoggedIn(true);
      setUserName(session.user_name || t('feishu.defaultUser'));
    }
  };

  const handleLogin = async () => {
    setIsAuthLoading(true);
    setErrorMsg('');
    try {
      const appId = ENV.LARK_APP_ID;
      const appSecret = ENV.LARK_APP_SECRET;
      if (!appId || !appSecret) throw new Error(t('feishu.error.noAppId'));

      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=cotabor_auth`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
      if (!responseUrl) throw new Error(t('feishu.error.noCallback'));

      const code = new URL(responseUrl).searchParams.get('code');
      if (!code) throw new Error(t('feishu.error.noCode'));

      const session = await getAccessTokenFromCode(code, appId, appSecret);
      await LarkAuthManager.getInstance().saveSessionAsync(session);
      await chrome.storage.local.set({ larkAppId: appId, larkAppSecret: appSecret });

      setIsLoggedIn(true);
      setUserName(session.user_name || t('feishu.defaultUser'));
    } catch (err: any) {
      setErrorMsg(err.message || t('feishu.error.loginFailed'));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleInit = async () => {
    if (!isLoggedIn) { setErrorMsg(t('feishu.error.notLoggedIn')); return; }
    if (!folderToken) { setErrorMsg(t('feishu.error.noFolder')); return; }
    setStatus('loading'); setErrorMsg('');
    try {
      const appId = ENV.LARK_APP_ID;
      const appSecret = ENV.LARK_APP_SECRET;
      await chrome.storage.local.set({ larkFolderToken: folderToken });
      const newConfig = await initializeBrainBase({ appId, appSecret, folderToken });
      await chrome.storage.local.set({ brainBaseConfig: newConfig });
      setConfig(newConfig);
      setStatus('success');
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(error.message || t('feishu.error.initFailed'));
    }
  };

  return (
    <div style={card}>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
        {t('feishu.desc')}
      </p>

      {/* Step 1 */}
      <div style={{ ...sectionBox, opacity: 1 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>{t('feishu.step1.title')}</h2>
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#16a34a' }}>
            <span>{t('feishu.step1.loggedIn')}<strong>{userName}</strong></span>
            <button onClick={handleLogin} style={btn('#6b7280')}>{t('feishu.step1.reauth')}</button>
          </div>
        ) : (
          <>
            <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>{t('feishu.step1.scanDesc')}</p>
            <button onClick={handleLogin} disabled={isAuthLoading} style={btn('#10b981', isAuthLoading)}>
              {isAuthLoading ? t('feishu.step1.authorizing') : t('feishu.step1.scanBtn')}
            </button>
          </>
        )}
      </div>

      {/* Step 2 */}
      <div style={{ ...sectionBox, opacity: isLoggedIn ? 1 : 0.5 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>{t('feishu.step2.title')}</h2>
        <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>
          {t('feishu.step2.desc')}
        </p>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>{t('feishu.step2.folderLabel')}</label>
          <input type="text" value={folderToken} onChange={e => setFolderToken(e.target.value)}
            disabled={!isLoggedIn} style={inputStyle} placeholder="https://xxx.feishu.cn/drive/folder/..." />
        </div>
        <button onClick={handleInit} disabled={status === 'loading' || !isLoggedIn}
          style={{ ...btn('#2563eb', status === 'loading' || !isLoggedIn), width: '100%', padding: '10px', fontSize: '15px' }}>
          {status === 'loading' ? t('feishu.step2.building') : t('feishu.step2.buildBtn')}
        </button>
      </div>

      {status === 'error' && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>❌ {errorMsg}</div>
      )}
      {status === 'success' && config && (
        <div style={{ padding: '14px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('feishu.success')}</p>
          <pre style={{ backgroundColor: '#f0fdf4', padding: '8px', borderRadius: '4px', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      )}
      {config && status !== 'success' && (
        <div style={{ padding: '14px', backgroundColor: '#f3f4f6', borderRadius: '4px', marginTop: '8px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('feishu.existingConfig')}</p>
          <pre style={{ margin: 0, fontSize: '12px', overflowX: 'auto' }}>{JSON.stringify(config, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default FeishuTab;
