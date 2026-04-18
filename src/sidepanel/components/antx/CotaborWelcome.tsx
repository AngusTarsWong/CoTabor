import React from 'react';
import { Button, Space, Typography, Card, Radio, Badge, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { IntegrationStatus } from '../../../shared/storage/integration-status';

const { Text, Title } = Typography;

interface CotaborWelcomeProps {
  setAgentGoal: (goal: string) => void;
  handleStartAgent: (goalOverride?: string) => void;
  integrationStatus: IntegrationStatus;
  openOptions: () => void;
  currentTabTitle?: string;
}

const QUICK_ACTIONS = [
  "帮我总结当前页面的核心内容",
  "提取这个页面的表格并保存到飞书",
];

export const CotaborWelcome: React.FC<CotaborWelcomeProps> = ({
  setAgentGoal,
  handleStartAgent,
  integrationStatus,
  openOptions,
  currentTabTitle
}) => {
  const { llm, activeMemoryBackend, mcp } = integrationStatus;
  
  let memoryStatus: 'success' | 'warning' = 'warning';
  let memoryText = '未启用 (点击配置)';
  if (activeMemoryBackend === 'feishu') {
    memoryStatus = 'success';
    memoryText = '飞书多维表格 (已连接)';
  } else if (activeMemoryBackend === 'notion') {
    memoryStatus = 'success';
    memoryText = 'Notion (已连接)';
  }

  return (
    <div style={{ margin: 'auto', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
      {/* 头部欢迎 */}
      <div style={{ textAlign: 'center', marginBottom: 8, marginTop: 10 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✨</div>
        <Title level={4} style={{ margin: 0, color: '#111827' }}>CoTabor 助手已就绪</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>您的智能浏览器自动化伙伴</Text>
      </div>

      {/* 运行模式配置 */}
      <Card size="small" title={<Text strong style={{ fontSize: 13 }}>📍 运行目标</Text>} style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.02)', borderColor: '#e5eef9' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Radio checked style={{ fontWeight: 500, color: '#111827' }}>
              在当前页面操作
            </Radio>
            <div style={{ marginLeft: 24, marginTop: 4, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
              {currentTabTitle || '当前激活的浏览器标签页'}
            </div>
          </div>
          <div>
            <Tooltip title="正在开发中，敬请期待" placement="right">
              <Radio disabled style={{ color: '#9ca3af' }}>
                在后台新开沙盒页面操作 (敬请期待)
              </Radio>
            </Tooltip>
          </div>
        </Space>
      </Card>

      {/* 环境自检 */}
      <Card 
        size="small" 
        title={<Text strong style={{ fontSize: 13 }}>⚙️ 基础设施状态</Text>} 
        extra={<Button type="link" size="small" icon={<SettingOutlined />} onClick={openOptions}>设置</Button>}
        style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.02)', borderColor: '#e5eef9' }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#4b5563' }}>🧠 AI 大模型</Text>
            <Badge status={llm.configured ? 'success' : 'error'} text={llm.configured ? '已配置' : '未配置'} style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#4b5563' }}>💾 记忆引擎</Text>
            <Badge status={memoryStatus} text={memoryText} style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#4b5563' }}>🔌 MCP 工具</Text>
            <Badge status={mcp.enabledCount > 0 ? 'success' : 'default'} text={`${mcp.enabledCount} 个可用`} style={{ fontSize: 12 }} />
          </div>
        </Space>
      </Card>

      {/* 快捷启动 */}
      <div style={{ marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8, marginBottom: 8, display: 'block' }}>💡 快捷指令</Text>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action}
              block
              onClick={() => {
                setAgentGoal(action);
                handleStartAgent(action);
              }}
              style={{
                height: 42,
                borderRadius: 12,
                textAlign: 'left',
                justifyContent: 'flex-start',
                fontSize: 13,
                color: '#374151',
                background: '#ffffff',
                borderColor: '#e5eef9',
                boxShadow: '0 2px 6px rgba(0,0,0,0.015)'
              }}
            >
              {action}
            </Button>
          ))}
        </Space>
      </div>
    </div>
  );
};