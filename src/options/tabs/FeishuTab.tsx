import React, { useState, useEffect } from 'react';
import { card, sectionBox, inputStyle, btn } from '../styles';
import { initializeBrainBase } from '../../skills/bundled/feishu-operator/init';
import { ENV } from '../../shared/constants/env';
import { LarkAuthManager, getAccessTokenFromCode } from '../../shared/utils/lark-auth';

const FeishuTab: React.FC = () => {
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
      setUserName(session.user_name || '飞书用户');
    }
  };

  const handleLogin = async () => {
    setIsAuthLoading(true);
    setErrorMsg('');
    try {
      const appId = ENV.LARK_APP_ID;
      const appSecret = ENV.LARK_APP_SECRET;
      if (!appId || !appSecret) throw new Error('插件未配置 VITE_LARK_APP_ID 或 VITE_LARK_APP_SECRET');

      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=cotabor_auth`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
      if (!responseUrl) throw new Error('未获取到回调地址，授权可能被取消');

      const code = new URL(responseUrl).searchParams.get('code');
      if (!code) throw new Error('授权失败：回调中没有 code 参数');

      const session = await getAccessTokenFromCode(code, appId, appSecret);
      await LarkAuthManager.getInstance().saveSessionAsync(session);
      await chrome.storage.local.set({ larkAppId: appId, larkAppSecret: appSecret });

      setIsLoggedIn(true);
      setUserName(session.user_name || '飞书用户');
    } catch (err: any) {
      setErrorMsg(err.message || '扫码登录失败');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleInit = async () => {
    if (!isLoggedIn) { setErrorMsg('请先完成飞书扫码授权登录'); return; }
    if (!folderToken) { setErrorMsg('请填写空文件夹链接 / Folder Token'); return; }
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
      setErrorMsg(error.message || '初始化失败');
    }
  };

  return (
    <div style={card}>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
        为了让 AI 拥有记忆与日志能力，需要将飞书作为后端数据库。
      </p>

      {/* Step 1 */}
      <div style={{ ...sectionBox, opacity: 1 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>步骤 1：飞书扫码授权</h2>
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#16a34a' }}>
            <span>✅ 已登录：<strong>{userName}</strong></span>
            <button onClick={handleLogin} style={btn('#6b7280')}>重新授权</button>
          </div>
        ) : (
          <>
            <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>使用飞书手机端扫码授权。</p>
            <button onClick={handleLogin} disabled={isAuthLoading} style={btn('#10b981', isAuthLoading)}>
              {isAuthLoading ? '⏳ 正在拉起授权...' : '📱 扫码登录飞书'}
            </button>
          </>
        )}
      </div>

      {/* Step 2 */}
      <div style={{ ...sectionBox, opacity: isLoggedIn ? 1 : 0.5 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>步骤 2：构建多维表格</h2>
        <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>
          在飞书云文档中创建一个<strong>空文件夹</strong>，将链接粘贴到下方，自动生成记忆库。
        </p>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>飞书空文件夹链接 / Folder Token</label>
          <input type="text" value={folderToken} onChange={e => setFolderToken(e.target.value)}
            disabled={!isLoggedIn} style={inputStyle} placeholder="https://xxx.feishu.cn/drive/folder/..." />
        </div>
        <button onClick={handleInit} disabled={status === 'loading' || !isLoggedIn}
          style={{ ...btn('#2563eb', status === 'loading' || !isLoggedIn), width: '100%', padding: '10px', fontSize: '15px' }}>
          {status === 'loading' ? '⏳ 正在构建...' : '🚀 一键初始化 AI 数据中心'}
        </button>
      </div>

      {status === 'error' && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>❌ {errorMsg}</div>
      )}
      {status === 'success' && config && (
        <div style={{ padding: '14px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>✅ 初始化成功！可以关闭此页面了。</p>
          <pre style={{ backgroundColor: '#f0fdf4', padding: '8px', borderRadius: '4px', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      )}
      {config && status !== 'success' && (
        <div style={{ padding: '14px', backgroundColor: '#f3f4f6', borderRadius: '4px', marginTop: '8px' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>📂 当前已有配置</p>
          <pre style={{ margin: 0, fontSize: '12px', overflowX: 'auto' }}>{JSON.stringify(config, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default FeishuTab;
