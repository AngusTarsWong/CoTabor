import React, { useState, useEffect } from 'react';
import { initializeBrainBase } from '../skills/bundled/feishu-operator/init';

const App: React.FC = () => {
  const [folderToken, setFolderToken] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    // Load existing settings
    chrome.storage.local.get(['larkAppId', 'larkAppSecret', 'larkFolderToken', 'brainBaseConfig'], (result) => {
      if (result.larkAppId) setAppId(result.larkAppId);
      if (result.larkAppSecret) setAppSecret(result.larkAppSecret);
      if (result.larkFolderToken) setFolderToken(result.larkFolderToken);
      if (result.brainBaseConfig) setConfig(result.brainBaseConfig);
    });
  }, []);

  const handleInit = async () => {
    if (!folderToken || !appId || !appSecret) {
      setErrorMsg('请填写所有必填字段');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      // Save credentials first
      await chrome.storage.local.set({
        larkAppId: appId,
        larkAppSecret: appSecret,
        larkFolderToken: folderToken
      });

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
          请输入您的飞书应用凭证以及一个空的云文档文件夹链接，我们将为您一键初始化所有的多维表格（记忆库与运行日志）。
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>飞书 App ID</label>
          <input 
            type="text" 
            value={appId} 
            onChange={(e) => setAppId(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="cli_a7..."
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>飞书 App Secret</label>
          <input 
            type="password" 
            value={appSecret} 
            onChange={(e) => setAppSecret(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="您的飞书应用密钥"
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>飞书空文件夹链接 / Folder Token</label>
          <input 
            type="text" 
            value={folderToken} 
            onChange={(e) => setFolderToken(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="https://xxx.feishu.cn/drive/folder/..."
          />
        </div>

        <button 
          onClick={handleInit}
          disabled={status === 'loading'}
          style={{
            backgroundColor: status === 'loading' ? '#9ca3af' : '#2563eb',
            color: 'white',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '4px',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            width: '100%'
          }}
        >
          {status === 'loading' ? '⏳ 正在构建大脑基地...' : '🚀 一键初始化 AI 数据中心'}
        </button>

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
