import React from 'react';
import { Button, Space, Typography } from 'antd';

const { Text, Title } = Typography;

interface CotaborWelcomeProps {
  setAgentGoal: (goal: string) => void;
  handleStartAgent: (goalOverride?: string) => void;
}

const QUICK_ACTIONS = [
  "帮我总结当前页面的核心内容",
  "提取这个页面的表格并保存到飞书",
];

export const CotaborWelcome: React.FC<CotaborWelcomeProps> = ({ setAgentGoal, handleStartAgent }) => {
  return (
    <div
      style={{
        margin: 'auto',
        width: '100%',
        maxWidth: 420,
        padding: '28px 20px',
        borderRadius: 24,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
        border: '1px solid #e5eef9',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            background: '#fff7ed',
            flexShrink: 0,
          }}
        >
          ✨
        </div>
        <div style={{ minWidth: 0 }}>
          <Title
            level={3}
            style={{
              margin: 0,
              color: '#111827',
              fontSize: 18,
              lineHeight: 1.35,
            }}
          >
            我是 CoTabor 助手
          </Title>
          <Text
            style={{
              display: 'block',
              marginTop: 8,
              color: '#6b7280',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            我可以帮您操作网页、提取信息，或者将内容沉淀到飞书记忆库中。
          </Text>
        </div>
      </div>

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
              height: 46,
              borderRadius: 14,
              textAlign: 'left',
              justifyContent: 'flex-start',
              fontSize: 15,
              fontWeight: 600,
              color: '#1f2937',
              borderColor: '#dbe3ef',
              background: '#ffffff',
            }}
          >
            {action}
          </Button>
        ))}
      </Space>
    </div>
  );
};
