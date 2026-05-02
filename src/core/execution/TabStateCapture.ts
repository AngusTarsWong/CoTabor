import { log } from "../../shared/utils/log";

export interface TabInfo {
  tabId: number;
  title: string;
  url: string;
}

/**
 * Captures the current state of all open browser tabs.
 * No-ops gracefully when the chrome.tabs API is unavailable (Node.js environment).
 */
export async function captureOpenedTabs(): Promise<TabInfo[]> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    return [];
  }
  try {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({}, resolve);
    });
    return tabs.map((t) => ({
      tabId: t.id!,
      title: t.title || "Untitled",
      url: t.url || "",
    }));
  } catch (e) {
    log.warn("TabStateCapture", "Failed to capture tab states:", e);
    return [];
  }
}
