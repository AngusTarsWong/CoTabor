import { getPageDriver } from "../../drivers/page";
import { log } from "../../shared/utils/log";

const DOM_IDLE_WAIT_MS = 1000;
const DOM_MAX_WAIT_MS = 5000;
const STATIC_FALLBACK_MS = 3000;
const NAVIGATION_SETTLE_MS = 1500;
const NAVIGATION_POLL_INTERVAL_MS = 200;
const NAVIGATION_POLL_MAX_MS = 8000;

// Chrome emits this -32000 error when a CDP command targets a page that has navigated away.
// This is expected after actions that trigger navigation (form submit, link click, etc.).
export const isNavigationError = (e: unknown): boolean => {
  const msg = (e as any)?.message || String(e);
  return (
    msg.includes("Inspected target navigated or closed") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  );
};

/**
 * Waits for the tab to finish navigating by polling chrome.tabs until the status is "complete".
 * Falls back to a static delay if the tabs API is unavailable.
 */
async function waitForNavigationComplete(tabId: number): Promise<void> {
  const deadline = Date.now() + NAVIGATION_POLL_MAX_MS;
  if (typeof chrome !== "undefined" && chrome.tabs?.get) {
    while (Date.now() < deadline) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === "complete") return;
      } catch {
        // tab may be briefly unavailable mid-navigation
      }
      await new Promise((r) => setTimeout(r, NAVIGATION_POLL_INTERVAL_MS));
    }
    return;
  }
  // No tabs API — just wait a fixed amount
  await new Promise((r) => setTimeout(r, NAVIGATION_SETTLE_MS));
}

const STABILIZE_SCRIPT = `
new Promise((resolve) => {
  let idleTimeout;
  let observer;
  const resetIdleTimer = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      if (observer) observer.disconnect();
      resolve("stabilized");
    }, ${DOM_IDLE_WAIT_MS});
  };
  resetIdleTimer();
  observer = new MutationObserver(() => { resetIdleTimer(); });
  observer.observe(document.body || document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });
  setTimeout(() => {
    if (observer) observer.disconnect();
    resolve("timeout");
  }, ${DOM_MAX_WAIT_MS});
});
`;

export interface PageSnapshot {
  url: string;
  title: string;
  pageContent: string;
}

/**
 * Waits for the page to stabilize after an action, then extracts the updated DOM snapshot.
 * If the action caused a navigation (CDP -32000 error), waits for the new page to load first.
 */
export async function stabilizeAndCapturePage(tabId: number): Promise<PageSnapshot> {
  // Dynamic wait: observe DOM mutations until idle
  try {
    const { cdpClient } = await import("../../drivers/cdp/index");
    const result = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: STABILIZE_SCRIPT,
      awaitPromise: true,
      returnByValue: true,
    });
    log.info("PageStabilizer", `Stabilized: ${result?.result?.value}`);
  } catch (e) {
    if (isNavigationError(e)) {
      log.info("PageStabilizer", "Page navigated during stabilization — waiting for new page to load.");
      await waitForNavigationComplete(tabId);
      // Give the new page's DOM a moment to settle before extracting content
      await new Promise((r) => setTimeout(r, NAVIGATION_SETTLE_MS));
    } else {
      log.warn("PageStabilizer", "Dynamic wait failed, using static fallback:", e);
      await new Promise((r) => setTimeout(r, STATIC_FALLBACK_MS));
    }
  }

  const { cdpClient } = await import("../../drivers/cdp/index");

  // Extract URL
  let url = "";
  try {
    const urlResult = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    url = urlResult?.result?.value || "";
  } catch {
    // Expected during mid-navigation
  }

  // Extract title
  let title = "Untitled";
  try {
    const titleResult = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: 'document.title || ""',
      returnByValue: true,
    });
    title = titleResult?.result?.value || "Untitled";
  } catch {
    // Expected during mid-navigation
  }

  // Extract semantic DOM
  let pageContent = "No text content found on page.";
  try {
    const pageDriver = getPageDriver(tabId);
    try {
      await pageDriver.init(tabId);
    } catch {
      // Driver might fail to init if tab is closed or navigated
    }
    pageContent = await pageDriver.getSemanticDOM();
  } catch (e) {
    log.warn("PageStabilizer", "DOM extraction failed:", e);
    pageContent = "Failed to extract page text using PageAgent";
  }

  log.info("PageStabilizer", `Post-action URL: ${url} (DOM len: ${pageContent.length})`);

  return {
    url,
    title,
    pageContent: `[Title: ${title}]\n[URL: ${url}]\n\n${pageContent}`,
  };
}
