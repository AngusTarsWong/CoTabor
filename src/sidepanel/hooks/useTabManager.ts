import { useState, useEffect } from 'react';
import { cdp } from '../../lib/claw';
import { getConflictingExtensionName } from '../../shared/utils/extension-detector';

type HostTabSnapshot = {
  id: number;
  title: string;
  url: string;
  windowId?: number;
  recordedAt?: number;
};

export function useTabManager(addLog: (sender: 'system', text: string, isError?: boolean, isSuccess?: boolean) => void) {
  const [tabId, setTabId] = useState<number | null>(null);
  const [boundTabId, setBoundTabId] = useState<number | null>(null);
  const [boundTabTitle, setBoundTabTitle] = useState<string>("");
  const [boundTabUrl, setBoundTabUrl] = useState<string>("");
  const [activeTabTitle, setActiveTabTitle] = useState<string>("");
  const [activeTabUrl, setActiveTabUrl] = useState<string>("");

  const isUsablePageUrl = (url?: string) => {
    if (!url) return false;
    const restrictedPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'view-source:'
    ];
    return !restrictedPrefixes.some(prefix => url.startsWith(prefix));
  };

  const refreshActiveTabId = async (): Promise<number | null> => {
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      setTabId(activeTab.id);
      setActiveTabTitle(activeTab.title || "");
      setActiveTabUrl(activeTab.url || "");
      return activeTab.id;
    }
    setActiveTabUrl("");
    return null;
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    return new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true }, (tabs) => {
        const candidates = (tabs || [])
          .filter((tab) => !!tab.id && isUsablePageUrl(tab.url))
          .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

        if (candidates.length > 0) {
          resolve(candidates[0]);
          return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (currentWindowTabs) => {
          if (currentWindowTabs && currentWindowTabs.length > 0) {
            resolve(currentWindowTabs[0]);
          } else {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
              resolve(fallbackTabs?.[0] ?? null);
            });
          }
        });
      });
    });
  };

  const getHostTab = async (): Promise<chrome.tabs.Tab | null> => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "cotabor:get-host-tab" }) as { hostTab?: HostTabSnapshot | null };
      const hostTab = response?.hostTab;
      if (hostTab?.id && isUsablePageUrl(hostTab.url)) {
        return {
          id: hostTab.id,
          title: hostTab.title,
          url: hostTab.url,
          windowId: hostTab.windowId,
          active: true,
        } as chrome.tabs.Tab;
      }
    } catch (error) {
      console.warn("[useTabManager] Failed to get host tab from background:", error);
    }

    return getActiveTab();
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
    const tab = await getHostTab();
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
    const result = await chrome.storage.local.get("boundTabId");
    if (result.boundTabId) return result.boundTabId as number;
    return refreshActiveTabId();
  };

  const softBindPage = async (tab: chrome.tabs.Tab) => {
    if (!tab.id) return;
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    setBoundTabId(tab.id);
    setBoundTabTitle(title);
    setBoundTabUrl(url);
    await chrome.storage.local.set({ boundTabId: tab.id, boundTabTitle: title, boundTabUrl: url });
  };

  const handleBindCurrentPage = async () => {
    const hostTab = await getHostTab();
    if (hostTab?.id) {
      setTabId(hostTab.id);
      setActiveTabTitle(hostTab.title || "");
      setActiveTabUrl(hostTab.url || "");
    } else {
      await refreshActiveTabId();
    }
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
    activeTabTitle,
    activeTabUrl,
    getHostTab,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
    softBindPage,
  };
}
