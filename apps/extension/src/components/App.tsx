import React, { useState } from 'react';
import { PlanItem, plannerNode, PlaybackEvent } from '@claw/core';

const PlanList: React.FC<{ items: PlanItem[] }> = ({ items }) => {
  return (
    <div className="plan-list">
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>执行计划</div>
      {items.length === 0 && <div style={{ padding: 10, color: '#999', fontSize: '12px' }}>暂无计划</div>}
      {items.map((item) => (
        <div key={item.id} className="step-item">
          <div className={`step-status status-${item.status}`} />
          <div className="step-content">
            <div className="step-title">{item.description}</div>
            {item.reasoning && <div className="step-reasoning">{item.reasoning}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

const PlaybackView: React.FC<{ items: PlaybackEvent[] }> = ({ items }) => {
  return (
    <div className="playback-view" style={{ padding: 10, background: '#f0f0f0', marginTop: 10, borderRadius: 8, maxHeight: '250px', overflowY: 'auto' }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>回放 (Preview)</div>
      {items.length === 0 && <div style={{ color: '#999', fontSize: '12px' }}>暂无回放数据</div>}
      {items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: 8, fontSize: '12px', borderBottom: '1px solid #e0e0e0', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '10px', marginBottom: '2px' }}>
            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
            <span>{item.type.toUpperCase()}</span>
          </div>
          {item.type === 'screenshot' || item.screenshot ? (
            <div style={{ marginTop: '4px' }}>
              {item.content && item.type !== 'screenshot' && <div style={{ marginBottom: '4px' }}>{item.content}</div>}
              <img 
                src={item.type === 'screenshot' ? item.content : item.screenshot} 
                alt="Screenshot" 
                style={{ width: '100%', borderRadius: '4px', border: '1px solid #ddd' }} 
              />
            </div>
          ) : (
            <div style={{ wordBreak: 'break-word' }}>{item.content}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [playbackItems, setPlaybackItems] = useState<PlaybackEvent[]>([]);

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;
    
    const newMessage = inputValue;
    // Don't clear immediately to allow user to see what they sent
    setLoading(true);

    try {
      setMessages((prev) => [...prev, newMessage]);
      setInputValue('');

      // Direct call to plannerNode for now to simulate agent execution
      // In real scenario, we would run the graph
      console.log('Invoking planner with:', newMessage);
      
      // Add initial user input to playback
      setPlaybackItems((prev) => [
        ...prev,
        { type: 'log', content: `用户输入: ${newMessage}`, timestamp: Date.now() }
      ]);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await plannerNode({ messages: [newMessage, ...messages] });
      
      console.log('Planner result:', result);
      setPlan(result.plan);
      
      // Add planner result to playback
      setPlaybackItems((prev) => [
        ...prev,
        { type: 'log', content: `Planner 分析完成，生成 ${result.plan.length} 个步骤`, timestamp: Date.now() }
      ]);

      // 模拟一个执行过程中的截图
      setTimeout(() => {
        setPlaybackItems((prev) => [
          ...prev,
          { 
            type: 'log', 
            content: `开始执行步骤 1: ${result.plan[0]?.description || '未知步骤'}`, 
            timestamp: Date.now() 
          },
          // 这里暂时用一个 placeholder 图片，实际应该调用 driver 获取截图
          {
            type: 'screenshot',
            content: 'https://via.placeholder.com/400x300.png?text=Browser+Screenshot+Mock',
            timestamp: Date.now() + 100
          }
        ]);
      }, 1000);
      
    } catch (error) {
      console.error('Error executing planner:', error);
      setPlaybackItems((prev) => [
        ...prev,
        { type: 'log', content: `执行出错: ${String(error)}`, timestamp: Date.now() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">ChromeClaw</div>
      
      <div style={{ marginBottom: 10, padding: '8px', background: '#e6f7ff', borderRadius: '4px', fontSize: '13px' }}>
        <strong>当前任务:</strong> {messages.length > 0 ? messages[messages.length - 1] : '等待输入...'}
      </div>

      <PlanList items={plan} />
      
      <div className="input-area" style={{ marginTop: 'auto', paddingTop: '10px' }}>
        <input 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
          placeholder="输入你的指令..."
          disabled={loading}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? '...' : '发送'}
        </button>
      </div>

      <PlaybackView items={playbackItems} />
    </div>
  );
}
