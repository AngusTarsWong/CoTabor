import React, { useState, useEffect } from 'react';
import { initializeBrainBase } from '../skills/bundled/feishu-operator/init';
import { initializeNotionBrainBase, extractNotionPageId } from '../skills/bundled/notion-operator/init';
import { ENV } from '../shared/constants/env';
import { NotionAuthManager, launchNotionOAuth, getNotionAccessTokenFromCode } from '../shared/utils/notion-auth';
import { LarkAuthManager, getAccessTokenFromCode } from '../shared/utils/lark-auth';
import { UserSkillLoader, McpServersStorage } from '../skills/user/loader';
import { skillRegistry } from '../skills/registry';
import { loadDynamicConfig } from '../shared/constants/env';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

// ─── Shared styles ───────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '24px',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0,0,0,.12)',
  marginBottom: '16px',
};

const sectionBox: React.CSSProperties = {
  padding: '16px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginBottom: '16px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const btn = (color: string, disabled = false): React.CSSProperties => ({
  backgroundColor: disabled ? '#9ca3af' : color,
  color: 'white',
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  fontWeight: 500,
});

// ─── LLM Config Tab ──────────────────────────────────────────────────────────

const LlmTab: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['llmConfig'], (result) => {
      const conf = result.llmConfig || {};
      setApiKey(conf.VITE_LLM_API_KEY || '');
      setBaseUrl(conf.VITE_LLM_BASE_URL || '');
      setModel(conf.VITE_LLM_MODEL || '');
    });
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    setErrorMsg('');
    try {
      const conf = {
        VITE_LLM_API_KEY: apiKey.trim(),
        VITE_LLM_BASE_URL: baseUrl.trim(),
        VITE_LLM_MODEL: model.trim(),
      };
      await chrome.storage.local.set({ llmConfig: conf });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || '保存失败');
    }
  };

  return (
    <div>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>全局大模型配置</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          配置你的 OpenAI 兼容接口，供 CoTabor 的规划器与执行器使用。若留空则使用默认的环境变量配置。
        </p>

        <div style={sectionBox}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>API Key (例如: sk-...)</label>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入 API 密钥"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>Base URL (例如: https://api.openai.com/v1)</label>
            <input 
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="请输入接口地址"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>Model Name (例如: gpt-4o)</label>
            <input 
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="请输入模型名称"
              style={inputStyle}
            />
          </div>
          <button 
            onClick={handleSave} 
            disabled={status === 'saving'}
            style={{ ...btn('#2563eb', status === 'saving'), width: '100%', padding: '10px' }}
          >
            {status === 'saving' ? '保存中...' : '保存大模型配置'}
          </button>
          
          {status === 'success' && <p style={{ color: '#10b981', fontSize: '14px', marginTop: '12px' }}>✅ 配置已保存成功！</p>}
          {status === 'error' && <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '12px' }}>❌ {errorMsg}</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Feishu Tab ───────────────────────────────────────────────────────────────

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

// ─── MCP Servers Tab ──────────────────────────────────────────────────────────

interface ServerFormState {
  name: string;
  url: string;
  headersRaw: string; // JSON string edited by user
  useSse: boolean;
}

const emptyForm = (): ServerFormState => ({ name: '', url: '', headersRaw: '{}', useSse: false });

const McpTab: React.FC = () => {
  const [servers, setServers] = useState<McpServersStorage>({});
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null); // null = new server
  const [form, setForm] = useState<ServerFormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [reloadStatus, setReloadStatus] = useState<string>('');

  useEffect(() => { loadServers(); }, []);

  const loadServers = async () => {
    const result = await chrome.storage.local.get('mcpServers');
    setServers(result.mcpServers || {});
  };

  const saveServers = async (updated: McpServersStorage) => {
    await UserSkillLoader.saveMcpConfig(updated);
    setServers(updated);
  };

  const openAdd = () => {
    setEditingKey(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (key: string) => {
    const s = servers[key];
    setEditingKey(key);
    setForm({
      name: key,
      url: s.url,
      headersRaw: JSON.stringify(s.headers || {}, null, 2),
      useSse: s.useSse ?? false,
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    const name = form.name.trim();
    if (!name) { setFormError('请填写服务器名称'); return; }
    if (!form.url.trim()) { setFormError('请填写服务器 URL'); return; }
    try { new URL(form.url.trim()); } catch { setFormError('URL 格式不合法'); return; }
    let headers: Record<string, string> = {};
    try { headers = JSON.parse(form.headersRaw || '{}'); } catch { setFormError('Headers 不是合法 JSON'); return; }

    const updated = { ...servers };
    // If renaming, remove old key
    if (editingKey && editingKey !== name) delete updated[editingKey];
    updated[name] = { url: form.url.trim(), headers, useSse: form.useSse };
    await saveServers(updated);
    setShowForm(false);
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`确认删除 MCP 服务器「${key}」？`)) return;
    const updated = { ...servers };
    delete updated[key];
    await saveServers(updated);
  };

  const handleToggle = async (key: string) => {
    const updated = { ...servers, [key]: { ...servers[key], enabled: !(servers[key].enabled !== false) } };
    await saveServers(updated);
  };

  const handleTest = async (key: string) => {
    setTestStatus(prev => ({ ...prev, [key]: 'testing' }));
    try {
      const { McpSkillAdapter } = await import('../skills/user/mcp-adapter');
      const cfg = servers[key];
      const adapter = new McpSkillAdapter({ name: key, url: cfg.url, headers: cfg.headers, useSse: cfg.useSse });
      await adapter.connect();
      const skills = await adapter.listSkills();
      await adapter.disconnect();
      setTestStatus(prev => ({ ...prev, [key]: 'ok' }));
      alert(`✅ 连接成功！发现 ${skills.length} 个工具：\n${skills.map(s => `• ${s.name}`).join('\n')}`);
    } catch (e: any) {
      setTestStatus(prev => ({ ...prev, [key]: 'fail' }));
      alert(`❌ 连接失败：${e.message}`);
    }
  };

  const handleReload = async () => {
    setReloadStatus('loading');
    try {
      const result = await skillRegistry.reloadUserSkills();
      setReloadStatus(`✅ 重载完成：${result.loaded} 个技能已加载`);
    } catch (e: any) {
      setReloadStatus(`❌ 重载失败：${e.message}`);
    }
    setTimeout(() => setReloadStatus(''), 4000);
  };

  const serverList = Object.entries(servers);

  return (
    <div style={card}>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
        添加远程 MCP 服务器（Streamable HTTP），插件启动时自动连接并将服务器工具注入 Agent 技能库。
        支持 Cloudflare Workers、Railway 等云端部署的 MCP server。
      </p>

      {/* Server list */}
      {serverList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: '8px', marginBottom: '12px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔌</div>
          <div>暂无 MCP 服务器，点击下方按钮添加</div>
        </div>
      ) : (
        <div style={{ marginBottom: '12px' }}>
          {serverList.map(([key, cfg]) => {
            const enabled = cfg.enabled !== false;
            const ts = testStatus[key] || 'idle';
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '6px',
                marginBottom: '8px', backgroundColor: enabled ? 'white' : '#f9fafb',
              }}>
                {/* Toggle */}
                <button onClick={() => handleToggle(key)} title={enabled ? '点击禁用' : '点击启用'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', flexShrink: 0 }}>
                  {enabled ? '🟢' : '⚫'}
                </button>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: enabled ? '#111827' : '#9ca3af' }}>{key}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cfg.url}{cfg.useSse ? ' · SSE' : ''}
                  </div>
                </div>

                {/* Actions */}
                <button onClick={() => handleTest(key)} disabled={ts === 'testing'}
                  style={{ ...btn('#6366f1', ts === 'testing'), padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>
                  {ts === 'testing' ? '测试中…' : ts === 'ok' ? '✅ 已测试' : ts === 'fail' ? '❌ 失败' : '测试'}
                </button>
                <button onClick={() => openEdit(key)} style={{ ...btn('#6b7280'), padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>编辑</button>
                <button onClick={() => handleDelete(key)} style={{ ...btn('#ef4444'), padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>删除</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={openAdd} style={btn('#2563eb')}>＋ 添加 MCP 服务器</button>
        <button onClick={handleReload} style={btn('#059669')}>⟳ 重新加载技能</button>
        {reloadStatus && <span style={{ fontSize: '13px', color: reloadStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{reloadStatus}</span>}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '28px', width: '480px', maxWidth: '95vw', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>
              {editingKey ? `编辑服务器「${editingKey}」` : '添加 MCP 服务器'}
            </h3>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>名称 *</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. github" style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>服务器 URL *</span>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://your-worker.workers.dev/mcp" style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>
                请求头 Headers <span style={{ fontWeight: 400, color: '#9ca3af' }}>(JSON，可选)</span>
              </span>
              <textarea value={form.headersRaw} onChange={e => setForm(f => ({ ...f, headersRaw: e.target.value }))}
                rows={3} placeholder={'{\n  "Authorization": "Bearer xxx"\n}'}
                style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.useSse} onChange={e => setForm(f => ({ ...f, useSse: e.target.checked }))} />
              <span style={{ fontSize: '13px', color: '#374151' }}>使用旧版 SSE 传输（兼容 2025-03 之前的服务器）</span>
            </label>

            {formError && (
              <div style={{ marginBottom: '14px', padding: '8px 12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '13px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={btn('#6b7280')}>取消</button>
              <button onClick={handleSave} style={btn('#2563eb')}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage guide */}
      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280', userSelect: 'none' }}>
          📖 如何部署远程 MCP 服务器？
        </summary>
        <div style={{ marginTop: '10px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#374151', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>推荐方案：Cloudflare Workers（免费）</p>
          <ol style={{ paddingLeft: '18px', margin: '0 0 10px' }}>
            <li>使用 <code>create-cloudflare</code> 脚手架创建 Workers 项目</li>
            <li>安装 <code>@modelcontextprotocol/sdk</code>，实现 <code>McpServer</code></li>
            <li>使用 <code>StreamableHTTPServerTransport</code> 绑定路由</li>
            <li><code>wrangler deploy</code> 发布，将 URL 填入上方</li>
          </ol>
          <p style={{ margin: '0', color: '#6b7280' }}>
            也可接入官方和社区公开的 MCP 服务器，例如 GitHub Copilot MCP、Brave Search MCP 等。
          </p>
        </div>
      </details>
    </div>
  );
};

// ─── Notion Tab ───────────────────────────────────────────────────────────────

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

  // Are Notion OAuth credentials configured in .env?
  const hasOAuthCreds = !!(ENV.NOTION_CLIENT_ID);

  useEffect(() => {
    chrome.storage.local.get(['notionApiKey', 'notionBackendConfig', 'storageBackend'], async (r) => {
      if (r.notionApiKey)        setApiKey(r.notionApiKey);
      if (r.notionBackendConfig) setConfig(r.notionBackendConfig);
      setIsActive(r.storageBackend === 'notion');

      // Restore login status from saved session
      const session = await NotionAuthManager.getInstance().loadSession();
      if (session?.access_token) {
        setIsLoggedIn(true);
        setUserName(session.user_name ?? session.workspace_name ?? 'Notion 用户');
      }
    });
  }, []);

  // ── Auth: OAuth flow ────────────────────────────────────────────────────────
  const handleOAuthLogin = async () => {
    setAuthLoading(true);
    setErrorMsg('');
    try {
      const clientId     = ENV.NOTION_CLIENT_ID;
      const clientSecret = ENV.NOTION_CLIENT_SECRET;
      if (!clientId) throw new Error('插件未配置 VITE_NOTION_CLIENT_ID，无法使用 OAuth 授权。');

      // 1. Launch OAuth popup
      const redirectUri = chrome.identity.getRedirectURL();
      const code        = await launchNotionOAuth(clientId);

      // 2. Exchange code for access token
      const session = await getNotionAccessTokenFromCode(code, clientId, clientSecret, redirectUri);

      // 3. Persist session (also writes notionApiKey)
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
  };

  // ── Auth: manual API key ────────────────────────────────────────────────────
  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    await chrome.storage.local.set({ notionApiKey: apiKey.trim() });
    setIsLoggedIn(true);
    setUserName('已配置 Token');
  };

  // ── Init ────────────────────────────────────────────────────────────────────
  const handleInit = async () => {
    const key = apiKey.trim();
    if (!key)            { setErrorMsg('请先完成授权或填写 Integration Token'); return; }
    if (!pageUrl.trim()) { setErrorMsg('请填写父页面 URL 或 Page ID'); return; }
    setInitStatus('loading'); setErrorMsg('');
    try {
      const parentPageId = extractNotionPageId(pageUrl.trim());
      await chrome.storage.local.set({ notionApiKey: key });
      const cfg = await initializeNotionBrainBase({ apiKey: key, parentPageId });
      await chrome.storage.local.set({ notionBackendConfig: cfg });
      setConfig(cfg);
      setInitStatus('success');
    } catch (e: any) {
      setInitStatus('error');
      setErrorMsg(e.message || '初始化失败');
    }
  };

  // ── Backend switch ──────────────────────────────────────────────────────────
  const handleActivate = async () => {
    await chrome.storage.local.set({ storageBackend: 'notion' });
    setIsActive(true);
  };

  const handleDeactivate = async () => {
    await chrome.storage.local.set({ storageBackend: 'feishu' });
    setIsActive(false);
  };

  return (
    <div style={card}>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
        使用 Notion Database 作为 AI 记忆后端（替代飞书多维表格）。支持 OAuth 一键授权或手动填写 Integration Token。
      </p>

      {isActive && (
        <div style={{ padding: '10px 14px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '6px', marginBottom: '16px', fontWeight: 600 }}>
          ✅ 当前记忆后端：Notion
        </div>
      )}

      {/* ── Step 1: Authorization ─────────────────────────────────────────────── */}
      <div style={sectionBox}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>步骤 1：授权 Notion 访问</h2>

        {/* OAuth option — shown only when client_id is configured */}
        {hasOAuthCreds && (
          <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
            <p style={{ fontSize: '13px', color: '#0369a1', marginBottom: '10px', fontWeight: 500 }}>
              方式一：OAuth 快速授权（推荐）
            </p>
            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#16a34a', fontSize: '14px' }}>✅ 已授权：<strong>{userName}</strong></span>
                <button onClick={handleOAuthLogin} style={btn('#6b7280')}>重新授权</button>
                <button onClick={handleLogout} style={btn('#ef4444')}>退出登录</button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px' }}>
                  点击按钮，在弹出的 Notion 授权页面中登录并选择工作区授权给 CoTabor。
                </p>
                <button
                  onClick={handleOAuthLogin}
                  disabled={authLoading}
                  style={btn('#6366f1', authLoading)}
                >
                  {authLoading ? '⏳ 正在授权...' : '🔑 网页快速授权 Notion'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Manual token option */}
        <div style={{ padding: '14px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '10px', fontWeight: 500 }}>
            {hasOAuthCreds ? '方式二：手动填写 Integration Token' : '填写 Notion Integration Token'}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
            前往 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>notion.so/my-integrations</a> 创建 Internal Integration，复制 Token（<code>secret_...</code>）。
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxx"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleSaveKey} style={btn('#6b7280')}>保存</button>
          </div>
        </div>

        {errorMsg && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '13px' }}>
            ❌ {errorMsg}
          </div>
        )}
      </div>

      {/* ── Step 2: Initialize databases ─────────────────────────────────────── */}
      <div style={{ ...sectionBox, opacity: isLoggedIn || apiKey ? 1 : 0.5 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>步骤 2：初始化 Notion 数据中心</h2>
        <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '10px' }}>
          在 Notion 中创建一个空白页面，将上方授权的 Integration 添加为该页面的连接，然后粘贴页面链接。
          CoTabor 将自动在其下创建 L1 / L2 / L3 三个数据库。
        </p>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>父页面 URL 或 Page ID</label>
          <input
            type="text"
            value={pageUrl}
            onChange={e => setPageUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://notion.so/My-Page-abc123..."
          />
        </div>
        <button
          onClick={handleInit}
          disabled={initStatus === 'loading' || (!isLoggedIn && !apiKey)}
          style={{ ...btn('#2563eb', initStatus === 'loading' || (!isLoggedIn && !apiKey)), width: '100%', padding: '10px', fontSize: '15px' }}
        >
          {initStatus === 'loading' ? '⏳ 正在初始化...' : '🚀 一键初始化 Notion 数据中心'}
        </button>
        {initStatus === 'error' && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '13px' }}>
            ❌ {errorMsg}
          </div>
        )}
      </div>

      {/* ── Step 3: Activate ─────────────────────────────────────────────────── */}
      {config && (
        <div style={{ ...sectionBox, backgroundColor: '#f0fdf4' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>步骤 3：启用 Notion 后端</h2>
          <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '12px' }}>
            已检测到 Notion 数据中心配置，点击切换后所有 L1/L2/L3 记忆将同步至 Notion。
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {!isActive ? (
              <button onClick={handleActivate} style={btn('#059669')}>✅ 切换为 Notion 后端</button>
            ) : (
              <button onClick={handleDeactivate} style={btn('#6b7280')}>↩ 切回飞书后端</button>
            )}
          </div>
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}>查看数据库 ID</summary>
            <pre style={{ margin: '8px 0 0', fontSize: '12px', backgroundColor: '#f9fafb', padding: '8px', borderRadius: '4px', overflowX: 'auto' }}>
              {JSON.stringify(config, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Tips */}
      <details style={{ marginTop: '8px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280', userSelect: 'none' }}>
          📖 OAuth 授权与 Integration Token 如何选择？
        </summary>
        <div style={{ marginTop: '10px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#374151', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>OAuth 快速授权（推荐，需插件开发者配置）</p>
          <p style={{ margin: '0 0 12px', color: '#6b7280' }}>插件内置 OAuth 凭证，点击按钮即可弹出 Notion 授权页，授权后自动获取 Token，无需手动复制。</p>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>手动 Integration Token（适合开发者自部署）</p>
          <ol style={{ paddingLeft: '18px', margin: 0 }}>
            <li>访问 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>notion.so/my-integrations</a> → 新建 Integration</li>
            <li>复制 Internal Integration Token（<code>secret_...</code>）</li>
            <li>在目标页面右上角「···」→「连接」→ 选择 Integration 授权</li>
          </ol>
        </div>
      </details>
    </div>
  );
};

// ─── Root App ─────────────────────────────────────────────────────────────────

type Tab = 'feishu' | 'notion' | 'mcp' | 'llm';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('notion');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    borderBottom: activeTab === t ? '2px solid #2563eb' : '2px solid transparent',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#2563eb' : '#6b7280',
    fontSize: '15px',
    transition: 'color .15s',
  });

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>🧠 CoTabor AI 设置</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>管理 AI 记忆后端与外部工具集成</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle('notion')} onClick={() => setActiveTab('notion')}>📝 Notion 设置</button>
        <button style={tabStyle('feishu')} onClick={() => setActiveTab('feishu')}>🪁 飞书设置</button>
        <button style={tabStyle('llm')} onClick={() => setActiveTab('llm')}>🤖 大模型配置</button>
        <button style={tabStyle('mcp')}    onClick={() => setActiveTab('mcp')}>🔌 MCP 服务器</button>
      </div>

      {activeTab === 'feishu' && <FeishuTab />}
      {activeTab === 'llm' && <LlmTab />}
      {activeTab === 'notion' && <NotionTab />}
      {activeTab === 'mcp'    && <McpTab />}
    </div>
  );
};

export default App;
