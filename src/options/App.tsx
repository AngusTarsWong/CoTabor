import React, { useState, useEffect } from 'react';
import { initializeBrainBase } from '../skills/bundled/feishu-operator/init';
import { ENV } from '../shared/constants/env';
import { LarkAuthManager, getAccessTokenFromCode } from '../shared/utils/lark-auth';

const App: React.FC = () => {
  const [folderToken, setFolderToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [config, setConfig] = useState<any>(null);
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    // Load existing settings
    chrome.storage.local.get(['larkFolderToken', 'brainBaseConfig'], (result) => {
      if (result.larkFolderToken) setFolderToken(result.larkFolderToken);
      if (result.brainBaseConfig) setConfig(result.brainBaseConfig);
    });

    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    const authManager = LarkAuthManager.getInstance();
    const session = await authManager.loadSessionAsync();
    if (session && session.access_token) {
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

      if (!appId || !appSecret) {
        throw new Error("插件未配置 VITE_LARK_APP_ID 或 VITE_LARK_APP_SECRET");
      }

      // 获取当前插件的专属回调地址 (https://<extension-id>.chromiumapp.org/)
      const redirectUri = chrome.identity.getRedirectURL();
      console.log('Redirect URI:', redirectUri);

      const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=cotabor_auth`;

      // 调起飞书扫码授权窗口
      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      if (!responseUrl) {
        throw new Error('未获取到回调地址，授权可能被取消');
      }

      // 解析回调 URL 中的 code
      const urlObj = new URL(responseUrl);
      const code = urlObj.searchParams.get('code');

      if (!code) {
        throw new Error('授权失败：回调中没有 code 参数');
      }

      // 换取 token 并保存
      const session = await getAccessTokenFromCode(code, appId, appSecret);
      await LarkAuthManager.getInstance().saveSessionAsync(session);

      // 保存 AppID 和 Secret 到 storage 以便旧代码兼容
      await chrome.storage.local.set({
        larkAppId: appId,
        larkAppSecret: appSecret
      });

      setIsLoggedIn(true);
      setUserName(session.user_name || '飞书用户');
      
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || '扫码登录失败');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleInit = async () => {
    if (!isLoggedIn) {
      setErrorMsg('请先完成飞书扫码授权登录');
      return;
    }
    if (!folderToken) {
      setErrorMsg('请填写空文件夹链接 / Folder Token');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const appId = ENV.LARK_APP_ID;
      const appSecret = ENV.LARK_APP_SECRET;

      await chrome.storage.local.set({ larkFolderToken: folderToken });

      // Initialize Feishu folders and Bitables
      const newConfig = await initializeBrainBase({
        appId,
        appSecret,
        folderToken
      });

      // Save the resulting configuration to Chrome Storage
      await chrome.storage.local.set({ brainBaseConfig: newConfig });
      setConfig(newConfig);
      setStatus('success');
    } catch (error: any) {
      console.error(error);
      setStatus('error');
      setErrorMsg(error.message || '初始化失败');
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
        🧠 CoTabor AI - 飞书大脑基地初始化
      </h1>
      
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <p style={{ marginBottom: '16px', color: '#666' }}>
          为了让 AI 拥有记忆与日志能力，我们需要将您的飞书作为后端数据库。请按照以下步骤完成初始化。
        </p>

        {/* 步骤 1：扫码登录 */}
        <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>步骤 1：飞书扫码授权</h2>
          {isLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', color: '#16a34a' }}>
              <span style={{ fontSize: '20px', marginRight: '8px' }}>✅</span>
              <span>已成功登录为：<strong>{userName}</strong></span>
              <button 
                onClick={handleLogin}
                style={{ marginLeft: '16px', padding: '4px 12px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: 'white' }}
              >
                重新授权
              </button>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>点击下方按钮，使用飞书手机端扫码授权，让插件获得您的身份凭证。</p>
              <button 
                onClick={handleLogin}
                disabled={isAuthLoading}
                style={{
                  backgroundColor: isAuthLoading ? '#9ca3af' : '#10b981',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isAuthLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isAuthLoading ? '⏳ 正在拉起授权...' : '📱 扫码登录飞书'}
              </button>
            </div>
          )}
        </div>

        {/* 步骤 2：初始化数据基地 */}
        <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', opacity: isLoggedIn ? 1 : 0.5 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>步骤 2：构建多维表格</h2>
          <p style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>
            请在您的飞书云文档中创建一个<strong>空的文件夹</strong>，并将其链接或 Token 粘贴到下方。我们将自动在此文件夹中生成记忆库和运行日志。
          </p>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>飞书空文件夹链接 / Folder Token</label>
            <input 
              type="text" 
              value={folderToken} 
              onChange={(e) => setFolderToken(e.target.value)}
              disabled={!isLoggedIn}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="https://xxx.feishu.cn/drive/folder/..."
            />
          </div>

          <button 
            onClick={handleInit}
            disabled={status === 'loading' || !isLoggedIn}
            style={{
              backgroundColor: (status === 'loading' || !isLoggedIn) ? '#9ca3af' : '#2563eb',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '4px',
              cursor: (status === 'loading' || !isLoggedIn) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            {status === 'loading' ? '⏳ 正在构建大脑基地...' : '🚀 一键初始化 AI 数据中心'}
          </button>
        </div>

        {status === 'error' && (
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px' }}>
            ❌ {errorMsg}
          </div>
        )}

        {status === 'success' && config && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>✅ 初始化成功！</h3>
            <p style={{ margin: '0 0 8px 0' }}>您的记忆库与日志中心已创建完毕，配置已自动保存。您可以关闭此页面了。</p>
            <pre style={{ backgroundColor: '#f3f4f6', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontSize: '12px' }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}

        {config && status !== 'success' && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '4px' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>📂 当前已有配置</h3>
            <pre style={{ margin: 0, overflowX: 'auto', fontSize: '12px' }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
