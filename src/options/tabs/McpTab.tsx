import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Typography, Button, Switch, List, Tag, Modal, Input, Checkbox, Space, Alert, Divider, Collapse } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, ReloadOutlined, CheckCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { UserSkillLoader, McpServersStorage } from '../../skills/user/loader';
import { skillRegistry } from '../../skills/registry';
import { BUILT_IN_SERVERS } from '../../skills/bundled/mcp-builtin';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

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
    <Card bordered={false} style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      <Paragraph type="secondary" style={{ fontSize: '14px', marginBottom: '16px' }}>
        {t('mcp.desc')}
      </Paragraph>

      {/* Built-in MCPs */}
      <Title level={5} style={{ marginBottom: '12px', marginTop: '24px' }}>{t('mcp.builtin.title')}</Title>
      <div style={{ marginBottom: '24px' }}>
        <List
          size="small"
          dataSource={BUILT_IN_SERVERS}
          renderItem={server => {
            const enabled = builtinStates[server.id] !== false;
            return (
              <List.Item
                style={{
                  backgroundColor: enabled ? 'white' : '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  padding: '12px 14px',
                }}
                actions={[
                  <Switch
                    checked={enabled}
                    onChange={() => handleToggleBuiltin(server.id)}
                    checkedChildren={<CheckCircleOutlined />}
                    unCheckedChildren={<PauseCircleOutlined />}
                  />
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong style={{ color: enabled ? '#111827' : '#9ca3af' }}>{server.name}</Text>
                      <Tag color="default">{t('mcp.builtin.badge')}</Tag>
                    </Space>
                  }
                  description={server.id === 'jina' ? t('mcp.builtin.jinaDesc') : t('mcp.builtin.wikipediaDesc')}
                />
              </List.Item>
            );
          }}
        />
      </div>

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <Title level={5} style={{ margin: 0 }}>{t('mcp.remote.title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} size="small">
          {t('mcp.remote.addBtn')}
        </Button>
      </div>
      <Paragraph type="secondary" style={{ fontSize: '13px', marginBottom: '16px' }}>
        {t('mcp.remote.desc')}
      </Paragraph>

      {/* Server list */}
      {serverList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: '8px', marginBottom: '12px' }}>
          <ApiOutlined style={{ fontSize: '32px', marginBottom: '8px' }} />
          <div>{t('mcp.remote.empty')}</div>
        </div>
      ) : (
        <div style={{ marginBottom: '12px' }}>
          <List
            size="small"
            dataSource={serverList}
            renderItem={([key, cfg]) => {
              const enabled = cfg.enabled !== false;
              const ts = testStatus[key] || 'idle';
              return (
                <List.Item
                  style={{
                    backgroundColor: enabled ? 'white' : '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    padding: '12px 14px',
                  }}
                  actions={[
                    <Button 
                      size="small" 
                      onClick={() => handleTest(key)} 
                      disabled={ts === 'testing'}
                      loading={ts === 'testing'}
                      type={ts === 'ok' ? 'default' : ts === 'fail' ? 'dashed' : 'primary'}
                      danger={ts === 'fail'}
                    >
                      {ts === 'testing' ? t('mcp.remote.testing') : ts === 'ok' ? t('mcp.remote.tested') : ts === 'fail' ? t('mcp.remote.testFailed') : t('mcp.remote.testBtn')}
                    </Button>,
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(key)}>{t('mcp.remote.editBtn')}</Button>,
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(key)}>{t('mcp.remote.deleteBtn')}</Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Switch
                        checked={enabled}
                        onChange={() => handleToggle(key)}
                      />
                    }
                    title={<Text strong style={{ color: enabled ? '#111827' : '#9ca3af' }}>{key}</Text>}
                    description={`${cfg.url}${cfg.useSse ? ' · SSE' : ''}`}
                  />
                </List.Item>
              );
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <Space wrap style={{ marginTop: '12px' }}>
        <Button icon={<ReloadOutlined />} onClick={handleReload} type="dashed">
          {t('mcp.reloadBtn')}
        </Button>
        {reloadStatus && reloadStatus !== 'loading' && (
          <Text type={reloadStatus.startsWith('✅') ? 'success' : 'danger'}>{reloadStatus}</Text>
        )}
      </Space>

      {/* Add / Edit form modal */}
      <Modal
        title={editingKey ? t('mcp.form.editTitle', { name: editingKey }) : t('mcp.form.addTitle')}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={handleSave}
        okText={t('mcp.form.save')}
        cancelText={t('mcp.form.cancel')}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: '4px' }}>{t('mcp.form.nameLabel')}</Text>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. github" disabled={!!editingKey} />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: '4px' }}>{t('mcp.form.urlLabel')}</Text>
            <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://your-worker.workers.dev/mcp" />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: '4px' }}>
              {t('mcp.form.headersLabel')} <Text type="secondary" style={{ fontWeight: 'normal' }}>{t('mcp.form.headersOptional')}</Text>
            </Text>
            <TextArea 
              value={form.headersRaw} 
              onChange={e => setForm(f => ({ ...f, headersRaw: e.target.value }))} 
              rows={3} 
              placeholder={'{\n  "Authorization": "Bearer xxx"\n}'}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <Checkbox checked={form.useSse} onChange={e => setForm(f => ({ ...f, useSse: e.target.checked }))}>
            {t('mcp.form.sseLabel')}
          </Checkbox>

          {formError && <Alert message={formError} type="error" showIcon />}
        </Space>
      </Modal>

      {/* Usage guide */}
      <Collapse ghost style={{ marginTop: '20px', backgroundColor: '#f8fafc' }}>
        <Panel header={<Text type="secondary">{t('mcp.guide.title')}</Text>} key="1">
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.7 }}>
            <Text strong>{t('mcp.guide.recommended')}</Text>
            <ol style={{ paddingLeft: '18px', margin: '8px 0 10px' }}>
              <li>{t('mcp.guide.step1')}</li>
              <li>{t('mcp.guide.step2')}</li>
              <li>{t('mcp.guide.step3')}</li>
              <li>{t('mcp.guide.step4')}</li>
            </ol>
            <Text type="secondary">
              {t('mcp.guide.community')}
            </Text>
          </div>
        </Panel>
      </Collapse>
    </Card>
  );
};

export default McpTab;
