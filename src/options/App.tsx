import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadDynamicConfig } from '../shared/constants/env';
import { Tabs, Typography, Space } from 'antd';
import { DatabaseOutlined, RobotOutlined, ApiOutlined } from '@ant-design/icons';

import LlmTab    from './tabs/LlmTab';
import NotionTab from './tabs/NotionTab';
import McpTab    from './tabs/McpTab';

loadDynamicConfig().catch(e => console.warn('[Options] Failed to load dynamic config:', e));

const { Title, Text } = Typography;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('llm');
  const { t } = useTranslation('options');

  const items = [
    {
      key: 'llm',
      label: (
        <span>
          <RobotOutlined />
          {t('tabs.llm')}
        </span>
      ),
      children: <LlmTab />,
    },
    {
      key: 'notion',
      label: (
        <span>
          <DatabaseOutlined />
          {t('tabs.notion')}
        </span>
      ),
      children: <NotionTab />,
    },
    {
      key: 'mcp',
      label: (
        <span>
          <ApiOutlined />
          {t('tabs.mcp')}
        </span>
      ),
      children: <McpTab />,
    },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Space align="center" style={{ marginBottom: '8px' }}>
        <img src="/icons/icon48.png" alt="CoTabor Logo" style={{ width: '32px', height: '32px' }} />
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
      </Space>
      <div style={{ marginBottom: '24px' }}>
        <Text type="secondary" style={{ fontSize: '14px' }}>{t('subtitle')}</Text>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        items={items} 
        size="large"
      />
    </div>
  );
};

export default App;
