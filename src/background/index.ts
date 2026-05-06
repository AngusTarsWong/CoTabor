type HostTabSnapshot = {
  id: number;
  title: string;
  url: string;
  windowId?: number;
  recordedAt: number;
};

const HOST_TAB_STORAGE_KEY = "sidePanelHostTab";
const LAST_WEB_TAB_STORAGE_KEY = "lastKnownWebTab";
const DEPRECATED_STORAGE_KEYS = ["uiPreferences"];

function toHostTabSnapshot(tab: chrome.tabs.Tab): HostTabSnapshot | null {
  if (!tab.id || !tab.url) return null;
  return {
    id: tab.id,
    title: tab.title ?? "",
    url: tab.url ?? "",
    windowId: tab.windowId,
    recordedAt: Date.now(),
  };
}

async function persistSnapshot(key: string, tab: chrome.tabs.Tab) {
  const snapshot = toHostTabSnapshot(tab);
  if (!snapshot) return;
  await chrome.storage.local.set({ [key]: snapshot });
}

async function initializeExtension() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.storage.local.remove(DEPRECATED_STORAGE_KEYS);
  } catch (error) {
    console.error("[Background] setPanelBehavior failed:", error);
  }
}

chrome.action.onClicked.addListener((tab) => {
  persistSnapshot(HOST_TAB_STORAGE_KEY, tab).catch((error) =>
    console.warn("[Background] Failed to persist action host tab:", error)
  );
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await persistSnapshot(LAST_WEB_TAB_STORAGE_KEY, tab);
  } catch (error) {
    console.warn("[Background] Failed to persist activated tab:", error);
  }
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (changeInfo.status !== "complete" && !changeInfo.url) return;

  try {
    await persistSnapshot(LAST_WEB_TAB_STORAGE_KEY, tab);
  } catch (error) {
    console.warn("[Background] Failed to persist updated tab:", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "cotabor:get-host-tab") return;

  chrome.storage.local
    .get([HOST_TAB_STORAGE_KEY, LAST_WEB_TAB_STORAGE_KEY])
    .then(async (stored) => {
      const hostTab = stored[HOST_TAB_STORAGE_KEY] as HostTabSnapshot | undefined;
      const lastKnownWebTab = stored[LAST_WEB_TAB_STORAGE_KEY] as HostTabSnapshot | undefined;
      const resolved = hostTab ?? lastKnownWebTab ?? null;

      if (hostTab) {
        await chrome.storage.local.remove(HOST_TAB_STORAGE_KEY);
      }

      sendResponse({ hostTab: resolved });
    })
    .catch((error) => {
      console.warn("[Background] Failed to resolve host tab:", error);
      sendResponse({ hostTab: null });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension().catch(() => {});
});
