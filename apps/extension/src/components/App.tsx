import React, { useState, useEffect } from 'react';
import { PlanItem, PlaybackEvent } from '@/driver';
import { useSessionStore } from '../store';

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
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { 
    currentSessionId, 
    initializeStore, 
    getCurrentSession, 
    createSession, 
    updateSession 
  } = useSessionStore();

  useEffect(() => {
    initializeStore();
  }, []);

  const session = getCurrentSession();
  const messages = session?.messages || [];
  const plan = session?.plan || [];
  const playbackItems = session?.events || [];

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;
    
    setLoading(true);
    const newMessage = inputValue;
    setInputValue('');

    try {
      let sessionId = currentSessionId;
      let currentMessages = messages;

      if (!sessionId) {
        sessionId = await createSession(newMessage);
        currentMessages = [newMessage];
      } else {
        // Update messages
        const newMessages = [...messages, newMessage];
        await updateSession(sessionId, { messages: newMessages });
        currentMessages = newMessages;
        
        // Add user input to playback
        const userEvent: PlaybackEvent = {
          type: 'log',
          content: `用户输入: ${newMessage}`,
          timestamp: Date.now()
        };
        await updateSession(sessionId, { 
          events: [...playbackItems, userEvent] 
        });
      }

      // Execute Agent Graph
      console.log('Invoking agent with:', newMessage);
      
      const inputs = {
        messages: currentMessages,
        plan: plan,
        trace: [],
      };

      // @ts-ignore
      const result = await graph.invoke(inputs);
      
      console.log('Agent result:', result);
      
      if (sessionId) {
        const newPlan = result.plan;
        const newEvents = result.trace || [];
        const resultMessages = result.messages;

        // 获取最新的 session 状态以确保 events 不会被覆盖
        const currentSession = getCurrentSession();
        const currentEvents = currentSession?.events || [];

        await updateSession(sessionId, {
          plan: newPlan,
          events: [...currentEvents, ...newEvents],
          messages: resultMessages,
          status: 'completed'
        });
      }
      
    } catch (error) {
      console.error('Error executing agent:', error);
      if (currentSessionId) {
         const errorEvent: PlaybackEvent = {
            type: 'log',
            content: `执行出错: ${String(error)}`,
            timestamp: Date.now()
         };
         // Re-fetch session to get latest events
         const currentSession = getCurrentSession();
         await updateSession(currentSessionId, {
            events: [...(currentSession?.events || []), errorEvent],
            status: 'failed'
         });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">CoTabor</div>
      
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
