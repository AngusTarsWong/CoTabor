import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useSessionStore } from '../store';
const PlanList = ({ items }) => {
    return (_jsxs("div", { className: "plan-list", children: [_jsx("div", { style: { fontSize: '12px', color: '#666', marginBottom: '8px' }, children: "\u6267\u884C\u8BA1\u5212" }), items.length === 0 && _jsx("div", { style: { padding: 10, color: '#999', fontSize: '12px' }, children: "\u6682\u65E0\u8BA1\u5212" }), items.map((item) => (_jsxs("div", { className: "step-item", children: [_jsx("div", { className: `step-status status-${item.status}` }), _jsxs("div", { className: "step-content", children: [_jsx("div", { className: "step-title", children: item.description }), item.reasoning && _jsx("div", { className: "step-reasoning", children: item.reasoning })] })] }, item.id)))] }));
};
const PlaybackView = ({ items }) => {
    return (_jsxs("div", { className: "playback-view", style: { padding: 10, background: '#f0f0f0', marginTop: 10, borderRadius: 8, maxHeight: '250px', overflowY: 'auto' }, children: [_jsx("div", { style: { fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }, children: "\u56DE\u653E (Preview)" }), items.length === 0 && _jsx("div", { style: { color: '#999', fontSize: '12px' }, children: "\u6682\u65E0\u56DE\u653E\u6570\u636E" }), items.map((item, idx) => (_jsxs("div", { style: { marginBottom: 8, fontSize: '12px', borderBottom: '1px solid #e0e0e0', paddingBottom: '4px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '10px', marginBottom: '2px' }, children: [_jsx("span", { children: new Date(item.timestamp).toLocaleTimeString() }), _jsx("span", { children: item.type.toUpperCase() })] }), item.type === 'screenshot' || item.screenshot ? (_jsxs("div", { style: { marginTop: '4px' }, children: [item.content && item.type !== 'screenshot' && _jsx("div", { style: { marginBottom: '4px' }, children: item.content }), _jsx("img", { src: item.type === 'screenshot' ? item.content : item.screenshot, alt: "Screenshot", style: { width: '100%', borderRadius: '4px', border: '1px solid #ddd' } })] })) : (_jsx("div", { style: { wordBreak: 'break-word' }, children: item.content }))] }, idx)))] }));
};
export default function App() {
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const { currentSessionId, initializeStore, getCurrentSession, createSession, updateSession } = useSessionStore();
    useEffect(() => {
        initializeStore();
    }, []);
    const session = getCurrentSession();
    const messages = session?.messages || [];
    const plan = session?.plan || [];
    const playbackItems = session?.events || [];
    const handleSubmit = async () => {
        if (!inputValue.trim())
            return;
        setLoading(true);
        const newMessage = inputValue;
        setInputValue('');
        try {
            let sessionId = currentSessionId;
            let currentMessages = messages;
            if (!sessionId) {
                sessionId = await createSession(newMessage);
                currentMessages = [newMessage];
            }
            else {
                // Update messages
                const newMessages = [...messages, newMessage];
                await updateSession(sessionId, { messages: newMessages });
                currentMessages = newMessages;
                // Add user input to playback
                const userEvent = {
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
        }
        catch (error) {
            console.error('Error executing agent:', error);
            if (currentSessionId) {
                const errorEvent = {
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
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "container", children: [_jsx("div", { className: "header", children: "CoTabor" }), _jsxs("div", { style: { marginBottom: 10, padding: '8px', background: '#e6f7ff', borderRadius: '4px', fontSize: '13px' }, children: [_jsx("strong", { children: "\u5F53\u524D\u4EFB\u52A1:" }), " ", messages.length > 0 ? messages[messages.length - 1] : '等待输入...'] }), _jsx(PlanList, { items: plan }), _jsxs("div", { className: "input-area", style: { marginTop: 'auto', paddingTop: '10px' }, children: [_jsx("input", { value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: (e) => e.key === 'Enter' && !loading && handleSubmit(), placeholder: "\u8F93\u5165\u4F60\u7684\u6307\u4EE4...", disabled: loading }), _jsx("button", { onClick: handleSubmit, disabled: loading, children: loading ? '...' : '发送' })] }), _jsx(PlaybackView, { items: playbackItems })] }));
}
