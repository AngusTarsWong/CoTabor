import { useState } from 'react';
import { cdp, dom, act, ElementInfo } from '../../lib/claw';
import { FeishuTableOperator } from '../../skills/bundled/feishu-operator/api';
import { VolcengineEmbeddingProvider } from '../../memory/rag/embedding';

export function useDebugTools(resolveTargetTabId: () => Promise<number | null>) {
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [activeDebugTab, setActiveDebugTab] = useState<'browser' | 'skills'>('browser');
  const [skillTestLog, setSkillTestLog] = useState<string>("");
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [targetId, setTargetId] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");

  const handleAttach = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    try {
      await cdp.attach(targetTabId);
      setSkillTestLog(`Attached to debugger (tab ${targetTabId})`);
    } catch (e: any) {
      setSkillTestLog(`Attach failed: ${e.message}`);
    }
  };

  const handleDetach = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    await cdp.detach(targetTabId);
    setSkillTestLog(`Detached debugger (tab ${targetTabId})`);
  };

  const handleScan = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId) return;
    try {
      setSkillTestLog("Scanning...");
      const els = await dom.scan(targetTabId);
      setElements(els);
      setSkillTestLog(`Scanned ${els.length} elements on tab ${targetTabId}`);
    } catch (e: any) {
      setSkillTestLog(`Scan failed: ${e.message}`);
    }
  };

  const handleClick = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId || !targetId) return;
    const el = elements.find((e) => e.id === Number(targetId));
    if (!el) {
      setSkillTestLog(`Element ${targetId} not found in scan results`);
      return;
    }
    try {
      const x = el.rect.x + el.rect.width / 2;
      const y = el.rect.y + el.rect.height / 2;
      await act.click(targetTabId, x, y);
      setSkillTestLog(`Clicked element ${targetId} at (${Math.round(x)}, ${Math.round(y)})`);
    } catch (e: any) {
      setSkillTestLog(`Click failed: ${e.message}`);
    }
  };

  const handleType = async () => {
    const targetTabId = await resolveTargetTabId();
    if (!targetTabId || !inputText) return;
    try {
      await act.type(targetTabId, inputText);
      setSkillTestLog(`Typed: "${inputText}"`);
    } catch (e: any) {
      setSkillTestLog(`Type failed: ${e.message}`);
    }
  };

  const testFeishuApi = async () => {
    setSkillTestLog("正在测试飞书 API 连接...");
    try {
      const result = await chrome.storage.local.get(['larkAppId', 'larkAppSecret', 'brainBaseConfig']);
      if (!result.larkAppId || !result.larkAppSecret || !result.brainBaseConfig?.memoriesAppToken) {
        setSkillTestLog("❌ 缺少飞书配置。请先在设置页完成初始化。");
        return;
      }

      const operator = new FeishuTableOperator({
        appId: result.larkAppId,
        appSecret: result.larkAppSecret,
        appToken: result.brainBaseConfig.memoriesAppToken,
        tableIds: result.brainBaseConfig.memoriesTableIds
      });

      const tables = await operator.getTables();
      setSkillTestLog(`✅ 飞书连接成功！读取到 ${tables.items.length} 个多维表格。`);
    } catch (error: any) {
      setSkillTestLog(`❌ 飞书 API 测试失败: ${error.message}`);
    }
  };

  const testVectorization = async () => {
    setSkillTestLog("正在测试火山引擎向量化 (Volcengine Embedding)...");
    try {
      const provider = new VolcengineEmbeddingProvider();
      const textToEmbed = "测试向量化能力";
      const vector = await provider.getEmbedding([{ type: "text", text: textToEmbed }]);
      
      setSkillTestLog(`✅ 向量化成功！\n输入: "${textToEmbed}"\n输出维度: ${vector.length} 维\n前5个值: ${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...`);
    } catch (error: any) {
      setSkillTestLog(`❌ 向量化测试失败: ${error.message}`);
    }
  };

  return {
    showDebug,
    setShowDebug,
    activeDebugTab,
    setActiveDebugTab,
    skillTestLog,
    elements,
    targetId,
    setTargetId,
    inputText,
    setInputText,
    handleAttach,
    handleDetach,
    handleScan,
    handleClick,
    handleType,
    testFeishuApi,
    testVectorization
  };
}
