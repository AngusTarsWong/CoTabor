import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('options');
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
    if (!name) { setFormError(t('mcp.form.error.noName')); return; }
    if (!form.url.trim()) { setFormError(t('mcp.form.error.noUrl')); return; }
    try { new URL(form.url.trim()); } catch { setFormError(t('mcp.form.error.invalidUrl')); return; }
    let headers: Record<string, string> = {};
    try { headers = JSON.parse(form.headersRaw || '{}'); } catch { setFormError(t('mcp.form.error.invalidHeaders')); return; }

    const updated = { ...servers };
    if (editingKey && editingKey !== name) delete updated[editingKey];
    updated[name] = { url: form.url.trim(), headers, useSse: form.useSse };
    await saveServers(updated);
    setShowForm(false);
  };

  const handleDelete = async (key: string) => {
    if (!confirm(t('mcp.remote.deleteConfirm', { name: key }))) return;
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
      alert(t('mcp.remote.testSuccess', { count: skills.length, tools: skills.map(s => `• ${s.name}`).join('\n') }));
    } catch (e: any) {
      setTestStatus(prev => ({ ...prev, [key]: 'fail' }));
      alert(t('mcp.remote.testFailMsg', { error: e.message }));
    }
  };

  const handleReload = async () => {
    setReloadStatus('loading');
    try {
      const result = await skillRegistry.reloadUserSkills();
      setReloadStatus(t('mcp.reloadSuccess', { count: result.loaded }));
    } catch (e: any) {
      setReloadStatus(t('mcp.reloadFailed', { error: e.message }));
    }
    setTimeout(() => setReloadStatus(''), 4000);
  };

  const serverList = Object.entries(servers);

  return (
    <div style={card}>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
        {t('mcp.desc')}
      </p>

      {/* Built-in MCPs */}
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', marginTop: '24px' }}>{t('mcp.builtin.title')}</h3>
      <div style={{ marginBottom: '24px' }}>
        {BUILT_IN_SERVERS.map(server => {
          const enabled = builtinStates[server.id] !== false;
          return (
            <div key={server.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '6px',
              marginBottom: '8px', backgroundColor: enabled ? 'white' : '#f9fafb',
            }}>
              <button onClick={() => handleToggleBuiltin(server.id)}
                title={enabled ? t('mcp.builtin.disableTitle') : t('mcp.builtin.enableTitle')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', flexShrink: 0, opacity: enabled ? 1 : 0.4, filter: enabled ? 'none' : 'grayscale(100%)' }}>
                {enabled ? '✅' : '⏸️'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: enabled ? '#111827' : '#9ca3af' }}>{server.name}</span>
                  <span style={{ fontSize: '11px', color: '#6b7280', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>{t('mcp.builtin.badge')}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {server.id === 'jina' ? t('mcp.builtin.jinaDesc') : t('mcp.builtin.wikipediaDesc')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '24px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{t('mcp.remote.title')}</h3>
        <button onClick={openAdd} style={{ ...btn('#2563eb'), padding: '6px 12px', fontSize: '13px' }}>
          {t('mcp.remote.addBtn')}
        </button>
      </div>
      <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
        {t('mcp.remote.desc')}
      </p>

      {/* Server list */}
      {serverList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: '8px', marginBottom: '12px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔌</div>
          <div>{t('mcp.remote.empty')}</div>
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
                <button onClick={() => handleToggle(key)}
                  title={enabled ? t('mcp.remote.disableTitle') : t('mcp.remote.enableTitle')}
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
                  {ts === 'testing' ? t('mcp.remote.testing') : ts === 'ok' ? t('mcp.remote.tested') : ts === 'fail' ? t('mcp.remote.testFailed') : t('mcp.remote.testBtn')}
                </button>
                <button onClick={() => openEdit(key)} style={{ ...btn('#6b7280'), padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>{t('mcp.remote.editBtn')}</button>
                <button onClick={() => handleDelete(key)} style={{ ...btn('#ef4444'), padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>{t('mcp.remote.deleteBtn')}</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={handleReload} style={btn('#059669')}>{t('mcp.reloadBtn')}</button>
        {reloadStatus && reloadStatus !== 'loading' && (
          <span style={{ fontSize: '13px', color: reloadStatus.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{reloadStatus}</span>
        )}
      </div>

      {/* Add / Edit form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '28px', width: '480px', maxWidth: '95vw', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700 }}>
              {editingKey ? t('mcp.form.editTitle', { name: editingKey }) : t('mcp.form.addTitle')}
            </h3>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>{t('mcp.form.nameLabel')}</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. github" style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>{t('mcp.form.urlLabel')}</span>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://your-worker.workers.dev/mcp" style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>
                {t('mcp.form.headersLabel')} <span style={{ fontWeight: 400, color: '#9ca3af' }}>{t('mcp.form.headersOptional')}</span>
              </span>
              <textarea value={form.headersRaw} onChange={e => setForm(f => ({ ...f, headersRaw: e.target.value }))}
                rows={3} placeholder={'{\n  "Authorization": "Bearer xxx"\n}'}
                style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.useSse} onChange={e => setForm(f => ({ ...f, useSse: e.target.checked }))} />
              <span style={{ fontSize: '13px', color: '#374151' }}>{t('mcp.form.sseLabel')}</span>
            </label>

            {formError && (
              <div style={{ marginBottom: '14px', padding: '8px 12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontSize: '13px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={btn('#6b7280')}>{t('mcp.form.cancel')}</button>
              <button onClick={handleSave} style={btn('#2563eb')}>{t('mcp.form.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage guide */}
      <details style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#6b7280', userSelect: 'none' }}>
          {t('mcp.guide.title')}
        </summary>
        <div style={{ marginTop: '10px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#374151', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('mcp.guide.recommended')}</p>
          <ol style={{ paddingLeft: '18px', margin: '0 0 10px' }}>
            <li>{t('mcp.guide.step1')}</li>
            <li>{t('mcp.guide.step2')}</li>
            <li>{t('mcp.guide.step3')}</li>
            <li>{t('mcp.guide.step4')}</li>
          </ol>
          <p style={{ margin: '0', color: '#6b7280' }}>
            {t('mcp.guide.community')}
          </p>
        </div>
      </details>
    </div>
  );
};

export default McpTab;
