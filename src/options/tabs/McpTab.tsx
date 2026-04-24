import React, { useState, useEffect } from 'react';
import { card, inputStyle, btn } from '../styles';
import { UserSkillLoader, McpServersStorage } from '../../skills/user/loader';
import { skillRegistry } from '../../skills/registry';
import { BUILT_IN_SERVERS } from '../../skills/bundled/mcp-builtin';

interface ServerFormState {
  name: string;
  url: string;
  headersRaw: string;
  useSse: boolean;
}

const emptyForm = (): ServerFormState => ({ name: '', url: '', headersRaw: '{}', useSse: false });

const McpTab: React.FC = () => {
  const [builtinStates, setBuiltinStates] = useState<Record<string, boolean>>({});
  const [servers, setServers] = useState<McpServersStorage>({});
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [reloadStatus, setReloadStatus] = useState<string>('');

  useEffect(() => { loadServers(); }, []);

  const loadServers = async () => {
    const result = await chrome.storage.local.get(['mcpServers', 'builtinMcpServers']);
    setServers(result.mcpServers || {});
    setBuiltinStates(result.builtinMcpServers || { jina: true, wikipedia: true });
  };

  const saveServers = async (updated: McpServersStorage) => {
    await UserSkillLoader.saveMcpConfig(updated);
    setServers(updated);
  };

  const handleToggleBuiltin = async (id: string) => {
    const newStates = { ...builtinStates, [id]: builtinStates[id] !== false ? false : true };
    setBuiltinStates(newStates);
    await chrome.storage.local.set({ builtinMcpServers: newStates });
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
      const { McpSkillAdapter } = await import('../../skills/user/mcp-adapter');
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
        MCP (Model Context Protocol) 允许你为 CoTabor 扩展外部工具和知识库。
      </p>

      {/* Built-in MCPs */}
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', marginTop: '24px' }}>🧩 内置 MCP (开箱即用)</h3>
      <div style={{ marginBottom: '24px' }}>
        {BUILT_IN_SERVERS.map(server => {
          const enabled = builtinStates[server.id] !== false;
          return (
            <div key={server.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '6px',
              marginBottom: '8px', backgroundColor: enabled ? 'white' : '#f9fafb',
            }}>
              <button onClick={() => handleToggleBuiltin(server.id)} title={enabled ? '点击禁用' : '点击启用'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', flexShrink: 0, opacity: enabled ? 1 : 0.4, filter: enabled ? 'none' : 'grayscale(100%)' }}>
                {enabled ? '✅' : '⏸️'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: enabled ? '#111827' : '#9ca3af' }}>{server.name}</span>
                  <span style={{ fontSize: '11px', color: '#6b7280', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>内置本地运行</span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {server.id === 'jina' ? '提供全网搜索与网页抓取读取能力，无需 API Key。' : '提供维基百科词条检索与摘要读取能力，无需 API Key。'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '24px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>🌐 远程 MCP 服务器</h3>
        <button onClick={openAdd} style={{ ...btn('#2563eb'), padding: '6px 12px', fontSize: '13px' }}>
          + 添加服务器
        </button>
      </div>
      <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
        添加远程 MCP 服务器（Streamable HTTP），支持 Cloudflare Workers、Railway 等云端部署。
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
                <button onClick={() => handleToggle(key)} title={enabled ? '点击禁用' : '点击启用'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', flexShrink: 0 }}>
                  {enabled ? '🟢' : '⚫'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: enabled ? '#111827' : '#9ca3af' }}>{key}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cfg.url}{cfg.useSse ? ' · SSE' : ''}
                  </div>
                </div>
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
        <button onClick={handleReload} style={btn('#059669')}>⟳ 重新加载技能</button>
        {reloadStatus && <span style={{ fontSize: '13px', color: reloadStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{reloadStatus}</span>}
      </div>

      {/* Add / Edit form modal */}
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

export default McpTab;
