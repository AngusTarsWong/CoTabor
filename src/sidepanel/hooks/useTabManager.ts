import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cdp } from '../../lib/claw';
import { getConflictingExtensionName } from '../../shared/utils/extension-detector';

const SESSION_LOCK_STORAGE_KEY = "boundTabSessionLocked";
const BOUND_TAB_STORAGE_KEYS = ["boundTabId", "boundTabTitle", "boundTabUrl", SESSION_LOCK_STORAGE_KEY];

type HostTabSnapshot = {
  id: number;
  title: string;
  url: string;
  windowId?: number;
  recordedAt?: number;
};

export function useTabManager(addLog: (
  sender: 'system',
  text: string,
  isError?: boolean,
  isSuccess?: boolean,
  options?: { displayStyle?: 'inline-status' }
) => void) {
  const { t } = useTranslation('sidepanel');
  const [tabId, setTabId] = useState<number | null>(null);
  const [boundTabId, setBoundTabId] = useState<number | null>(null);
  const [boundTabTitle, setBoundTabTitle] = useState<string>("");
  const [boundTabUrl, setBoundTabUrl] = useState<string>("");
  const [sessionLocked, setSessionLocked] = useState<boolean>(false);
  const [activeTabTitle, setActiveTabTitle] = useState<string>("");
  const [activeTabUrl, setActiveTabUrl] = useState<string>("");

  const isInspectablePageUrl = (url?: string) => {
    const restrictedPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'view-source:'
    ];
    return !!url && !restrictedPrefixes.some(prefix => url.startsWith(prefix));
  };

  const toTabSnapshot = (tab: chrome.tabs.Tab | null | undefined) => {
    if (!tab?.id) return null;
    return {
      id: tab.id,
      title: tab.title ?? "",
      url: tab.url ?? "",
      windowId: tab.windowId,
    } as chrome.tabs.Tab;
  };

  const persistBoundTab = async (tab: chrome.tabs.Tab, locked: boolean) => {
    await chrome.storage.local.set({
      boundTabId: tab.id,
      boundTabTitle: tab.title ?? "",
      boundTabUrl: tab.url ?? "",
      [SESSION_LOCK_STORAGE_KEY]: locked,
    });
  };

  const refreshActiveTabId = async (): Promise<number | null> => {
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      setTabId(activeTab.id);
      setActiveTabTitle(activeTab.title || "");
      setActiveTabUrl(activeTab.url || "");
      return activeTab.id;
    }
    setTabId(null);
    setActiveTabTitle("");
    setActiveTabUrl("");
    return null;
  };

  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    return new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (currentWindowTabs) => {
        resolve(toTabSnapshot(currentWindowTabs?.[0]));
      });
    });
  };

  const getHostTab = async (): Promise<chrome.tabs.Tab | null> => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "cotabor:get-host-tab" }) as { hostTab?: HostTabSnapshot | null };
      const hostTab = response?.hostTab;
      if (hostTab?.id) {
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

    return null;
  };

  const refreshBoundTabInfo = async (id: number) => {
    try {
      const tab = await chrome.tabs.get(id);
      setBoundTabTitle(tab.title ?? "");
      setBoundTabUrl(tab.url ?? "");
      await chrome.storage.local.set({
        boundTabId: id,
        boundTabTitle: tab.title ?? "",
        boundTabUrl: tab.url ?? "",
        [SESSION_LOCK_STORAGE_KEY]: sessionLocked,
      });
    } catch {
      setBoundTabId(null);
      setBoundTabTitle("");
      setBoundTabUrl("");
      setSessionLocked(false);
      await chrome.storage.local.remove(BOUND_TAB_STORAGE_KEYS);
    }
  };

  const bindCurrentPage = async (tabOverride?: chrome.tabs.Tab | null): Promise<number | null> => {
    const tab = tabOverride ?? await getActiveTab();
    if (!tab?.id) {
      addLog('system', t('tab.errorNoPage'), true);
      return null;
    }
    
    const title = tab.title ?? "";
    const url = tab.url ?? "";
    
    if (!url) {
      addLog('system', t('tab.errorNoUrl'), true);
      return null;
    }

    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e: any) {
      console.warn('[bindCurrentPage] Failed to activate tab:', e);
    }
    
    if (isInspectablePageUrl(url)) {
      try {
        await cdp.attach(tab.id);
        addLog('system', t('tab.connected', { title: title || url }), false, true);
      } catch (e: any) {
        const errorMsg = e?.message || String(e);
        if (errorMsg.includes('Cannot access a chrome-extension:// URL of different extension')) {
          let pluginNameInfo = "other browser extensions";
          const conflictName = await getConflictingExtensionName(tab.id);
          if (conflictName) {
            pluginNameInfo = `【${conflictName}】`;
          }
          addLog('system', t('tab.restrictedInjected', { name: pluginNameInfo }), true);
        } else {
          addLog('system', t('tab.connectionFailed', { error: errorMsg }), true);
        }
      }
    } else {
      addLog('system', t('tab.restrictedPage', { title: title || url }), false, false, { displayStyle: 'inline-status' });
    }

    await persistBoundTab(tab, true);
    setBoundTabId(tab.id);
    setBoundTabTitle(title);
    setBoundTabUrl(url);
    setSessionLocked(true);
    addLog('system', t('tab.bound', { title: title || url }), false, true);
    return tab.id;
  };

  const lockSessionTab = async (tabOverride?: chrome.tabs.Tab | null): Promise<number | null> => {
    const tab = tabOverride ?? (boundTabId ? await chrome.tabs.get(boundTabId).catch(() => null) : await getActiveTab());
    if (!tab?.id) {
      return null;
    }

    const snapshot = toTabSnapshot(tab);
    if (!snapshot?.id) return null;
    await persistBoundTab(snapshot, true);
    setBoundTabId(snapshot.id);
    setBoundTabTitle(snapshot.title ?? "");
    setBoundTabUrl(snapshot.url ?? "");
    setSessionLocked(true);
    return snapshot.id;
  };

  const resolveTargetTabId = async (): Promise<number | null> => {
    const stored = await chrome.storage.local.get(["boundTabId", SESSION_LOCK_STORAGE_KEY]);
    if (stored.boundTabId) {
      if (!stored[SESSION_LOCK_STORAGE_KEY]) {
        await chrome.storage.local.set({ [SESSION_LOCK_STORAGE_KEY]: true });
        setSessionLocked(true);
      }
      return stored.boundTabId as number;
    }

    const activeTab = await getActiveTab();
    if (!activeTab?.id) return null;
    return lockSessionTab(activeTab);
  };

  const softBindPage = async (tab: chrome.tabs.Tab, options?: { locked?: boolean }) => {
    const snapshot = toTabSnapshot(tab);
    if (!snapshot?.id) return;
    const locked = options?.locked ?? sessionLocked;
    setBoundTabId(snapshot.id);
    setBoundTabTitle(snapshot.title ?? "");
    setBoundTabUrl(snapshot.url ?? "");
    setSessionLocked(locked);
    await persistBoundTab(snapshot, locked);
  };

  const followActiveTabIfUnlocked = async (tab?: chrome.tabs.Tab | null, options?: { force?: boolean }) => {
    if (sessionLocked && !options?.force) return;
    const activeTab = tab ?? await getActiveTab();
    if (!activeTab?.id) return;
    const snapshot = toTabSnapshot(activeTab);
    if (!snapshot?.id) return;
    setBoundTabId(snapshot.id);
    setBoundTabTitle(snapshot.title ?? "");
    setBoundTabUrl(snapshot.url ?? "");
    setSessionLocked(false);
    await persistBoundTab(snapshot, false);
  };

  const releaseSessionBinding = async () => {
    setBoundTabId(null);
    setBoundTabTitle("");
    setBoundTabUrl("");
    setSessionLocked(false);
    await chrome.storage.local.remove(BOUND_TAB_STORAGE_KEYS);
  };

  const restoreBoundPageSnapshot = async (snapshot: {
    boundTabId?: number | null;
    boundTabTitle?: string;
    boundTabUrl?: string;
    sessionLocked?: boolean;
  }) => {
    const id = snapshot.boundTabId ?? null;
    const title = snapshot.boundTabTitle ?? "";
    const url = snapshot.boundTabUrl ?? "";
    const locked = id ? snapshot.sessionLocked !== false : false;
    setBoundTabId(id);
    setBoundTabTitle(title);
    setBoundTabUrl(url);
    setSessionLocked(locked);

    if (id) {
      await chrome.storage.local.set({ boundTabId: id, boundTabTitle: title, boundTabUrl: url, [SESSION_LOCK_STORAGE_KEY]: locked });
    } else {
      await chrome.storage.local.remove(BOUND_TAB_STORAGE_KEYS);
    }
  };

  const handleBindCurrentPage = async () => {
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      setTabId(activeTab.id);
      setActiveTabTitle(activeTab.title || "");
      setActiveTabUrl(activeTab.url || "");
      await bindCurrentPage(activeTab);
      return;
    }

    const hostTab = await getHostTab();
    if (hostTab?.id) {
      setTabId(hostTab.id);
      setActiveTabTitle(hostTab.title || "");
      setActiveTabUrl(hostTab.url || "");
      await bindCurrentPage(hostTab);
      return;
    }

    await refreshActiveTabId();
    await bindCurrentPage();
  };

  useEffect(() => {
    refreshActiveTabId().then(async () => {
      const result = await chrome.storage.local.get(BOUND_TAB_STORAGE_KEYS);
      if (result.boundTabId) {
        const id = result.boundTabId as number;
        const locked = result[SESSION_LOCK_STORAGE_KEY] === true;
        setBoundTabId(id);
        setBoundTabTitle((result.boundTabTitle as string) || "");
        setBoundTabUrl((result.boundTabUrl as string) || "");
        setSessionLocked(locked);
        refreshBoundTabInfo(id).catch(() => {});
        return;
      }

      const hostTab = await getHostTab();
      if (hostTab?.id) {
        await followActiveTabIfUnlocked(hostTab);
      } else {
        await followActiveTabIfUnlocked();
      }
    }).catch(() => {});

    const onActivated = () => {
      refreshActiveTabId().then(async (id) => {
        if (!id || sessionLocked) return;
        const activeTab = await getActiveTab();
        await followActiveTabIfUnlocked(activeTab);
      }).catch(() => {});
    };
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (changeInfo.status === "complete" || changeInfo.url)) {
        refreshActiveTabId().then(() => followActiveTabIfUnlocked(tab)).catch(() => {});
      }
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
  }, [boundTabId, sessionLocked]);

  return {
    tabId,
    boundTabId,
    boundTabTitle,
    boundTabUrl,
    sessionLocked,
    activeTabTitle,
    activeTabUrl,
    getHostTab,
    resolveTargetTabId,
    bindCurrentPage,
    handleBindCurrentPage,
    softBindPage,
    followActiveTabIfUnlocked,
    lockSessionTab,
    releaseSessionBinding,
    restoreBoundPageSnapshot,
  };
}
