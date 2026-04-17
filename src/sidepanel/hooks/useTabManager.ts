import { useState, useEffect } from 'react';
import { cdp } from '../../lib/claw';
import { getConflictingExtensionName } from '../../shared/utils/extension-detector';

export function useTabManager(addLog: (sender: 'system', text: string, isError?: boolean, isSuccess?: boolean) => void) {
  const [tabId, setTabId] = useState<number | null>(null);
  const [boundTabId, setBoundTabId] = useState<number | null>(null);
  const [boundTabTitle, setBoundTabTitle] = useState<string>("");
  const [boundTabUrl, setBoundTabUrl] = useState<string>("");

  const refreshActiveTabId = async (): Promise<number | null> => {
    const activeId = await new Promise<number | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0].id ?? null);
        } else {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
            resolve(fallbackTabs?.[0]?.id ?? null);
          });
        }
      });
    });
    if (activeId) {
      setTabId(activeId);
      return activeId;
    }
    return null;
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    return new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
            resolve(fallbackTabs?.[0] ?? null);
          });
        }
      });
    });
  };

  const refreshBoundTabInfo = async (id: number) => {
    try {
      const tab = await chrome.tabs.get(id);
      setBoundTabTitle(tab.title ?? "");
      setBoundTabUrl(tab.url ?? "");
      await chrome.storage.local.set({
        boundTabId: id,
        boundTabTitle: tab.title ?? "",
        boundTabUrl: tab.url ?? ""
      });
    } catch {
      setBoundTabTitle("");
    }
  };

  const bindCurrentPage = async (): Promise<number | null> => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      addLog('system', "错误：无法绑定，未找到当前页面。", true);
      return null;
    }
    
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    
    if (!url) {
      addLog('system', `错误：无法绑定该页面（无法获取URL）。这通常是因为 Chrome 的安全限制，请确保当前是一个普通的网页（或尝试刷新页面）。`, true);
      return null;
    }
    
    const restrictedPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'view-source:'
    ];
    
    if (restrictedPrefixes.some(prefix => url.startsWith(prefix))) {
      addLog('system', `错误：无法绑定受限页面 (${url})。请切换到普通网页后再试。`, true);
      return null;
    }
    
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e: any) {
      console.warn('[bindCurrentPage] Failed to activate tab:', e);
    }
    
    try {
      await cdp.attach(tab.id);
      addLog('system', `✅ CDP 会话已连接到页面: ${title || url}`, false, true);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      if (errorMsg.includes('Cannot access a chrome-extension:// URL of different extension')) {
        let pluginNameInfo = "其他浏览器插件（如翻译、去广告、密码管理等）";
        const conflictName = await getConflictingExtensionName(tab.id);
        if (conflictName) {
          pluginNameInfo = `【${conflictName}】插件`;
        }
        addLog('system', `❌ 绑定失败：当前页面被${pluginNameInfo}注入了内容，触发了 Chrome 的底层安全限制。建议：1. 刷新页面重试 2. 暂时禁用该插件 3. 在无痕模式下使用。`, true);
      } else {
        addLog('system', `⚠️ CDP 连接失败: ${errorMsg}。部分功能可能不可用。`, true);
      }
      return null;
    }
    
    await chrome.storage.local.set({ boundTabId: tab.id, boundTabTitle: title, boundTabUrl: url });
    setBoundTabId(tab.id);
    setBoundTabTitle(title);
    setBoundTabUrl(url);
    addLog('system', `已绑定页面: ${title || url}`, false, true);
    return tab.id;
  };

  const resolveTargetTabId = async (): Promise<number | null> => {
    if (boundTabId) return boundTabId;
    return refreshActiveTabId();
  };

  const handleBindCurrentPage = async () => {
    await refreshActiveTabId();
    await bindCurrentPage();
  };

  useEffect(() => {
    refreshActiveTabId().catch(() => {});
    chrome.storage.local.get(["boundTabId", "boundTabTitle", "boundTabUrl"]).then((result) => {
      if (result.boundTabId) {
        const id = result.boundTabId as number;
        setBoundTabId(id);
        setBoundTabTitle((result.boundTabTitle as string) || "");
        setBoundTabUrl((result.boundTabUrl as string) || "");
        refreshBoundTabInfo(id).catch(() => {});
      }
    });

    const onActivated = () => refreshActiveTabId().catch(() => {});
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && changeInfo.status === "complete") refreshActiveTabId().catch(() => {});
      if (boundTabId && tab.id === boundTabId && changeInfo.status === "complete") {
        refreshBoundTabInfo(boundTabId).catch(() => {});
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [boundTabId]);

  return {
    tabId,
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
  };
}
